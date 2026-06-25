// Dynamic application-form renderer. Given the backend-extracted questions array, builds a
// responsive, typed set of controls inside the modal's shadow root. There is NO fixed set of
// fields — every posting asks different things — so this renders whatever it's handed, picking
// the control from each question's `type` (short_text/long_text/select/radio/multi_select/
// checkbox/number/url/email/tel/date/file) and preserving placeholders.
//
// Layout is a CSS grid: compact fields (text/number/url/select/date…) flow two-per-row when
// the panel is wide enough; long answers, choice groups, and file inputs span the full width.
// So it's not a flat linear list.
//
// Self-contained: exposes css() (scoped under .apppane so it can't disturb the Details tab)
// and render(questions). Built with createElement only — no innerHTML for model output — so a
// crafted label/option can't inject markup. Isolated-world global: JobTracker.ui.applicationForm.
(function (root) {
  const NS = (root.JobTracker = root.JobTracker || {});
  const UI = (NS.ui = NS.ui || {});

  // Compact types share a row; everything else spans full width.
  const COMPACT = new Set(["short_text", "number", "url", "email", "tel", "date", "select"]);
  // Map our semantic type → native <input type>.
  const INPUT_TYPE = {
    short_text: "text",
    number: "number",
    url: "url",
    email: "email",
    tel: "tel",
    date: "date",
  };

  const SVGNS = "http://www.w3.org/2000/svg";
  // lucide-style geometry (24×24). A flag (not a star) reads as "review this later" rather than
  // "favourite"; its banner fills amber when flagged. link marks url fields.
  const FLAG_PATHS = '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>';
  const LINK_PATHS =
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>';

  let uid = 0;
  const nextId = () => "appf-" + ++uid;

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        if (k === "text") n.textContent = attrs[k];
        else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      }
    for (const c of kids || []) n.append(c);
    return n;
  }

  // Inline SVG in the SVG namespace so it renders in the shadow root. `filled` paints the
  // shape (used for the active star); otherwise it's a stroked outline.
  function icon(paths, filled) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", filled ? "currentColor" : "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths;
    return svg;
  }

  // A per-question flag toggle. Mutates q.flagged in place and notifies via onChange so the
  // modal can re-persist (the cached questions are what the save payload reads). The filled
  // amber flag carries the "review this later" meaning.
  function flagButton(q, onChange) {
    const btn = el("button", { type: "button", class: "appflag" });
    function sync() {
      const on = !!q.flagged;
      btn.replaceChildren(icon(FLAG_PATHS, on));
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      const lbl = on ? "Unflag this question" : "Flag this question for review";
      btn.setAttribute("aria-label", lbl);
      btn.setAttribute("title", on ? "Flagged for review" : "Flag for review");
    }
    sync();
    btn.addEventListener("click", () => {
      q.flagged = !q.flagged;
      sync();
      if (onChange) onChange();
    });
    return btn;
  }

  // Label row + optional helper text. `controlId` ties the <label> to its control.
  function labelRow(q, controlId) {
    const lab = el("label", { class: "applabel", for: controlId, text: q.label });
    if (q.required) lab.append(el("span", { class: "req", "aria-hidden": "true", text: " *" }));
    return lab;
  }

  function helpNode(q) {
    return q.helpText ? el("p", { class: "apphelp", text: q.helpText }) : null;
  }

  function textControl(q, id) {
    const attrs = { id, class: "appinput", type: INPUT_TYPE[q.type] || "text" };
    if (q.placeholder) attrs.placeholder = q.placeholder;
    if (q.type === "number") attrs.inputmode = "decimal";
    const input = el("input", attrs);
    // url fields carry a leading link glyph inside the input so they read as a link field.
    if (q.type === "url") {
      input.classList.add("appinput--icon");
      const ic = el("span", { class: "appinput-ic" }, [icon(LINK_PATHS)]);
      return el("div", { class: "appinput-wrap" }, [ic, input]);
    }
    return input;
  }

  function textareaControl(q, id) {
    const attrs = { id, class: "appinput apptext", rows: "8" };
    if (q.placeholder) attrs.placeholder = q.placeholder;
    return el("textarea", attrs);
  }

  function selectControl(q, id) {
    const sel = el("select", { id, class: "appinput appselect" });
    // Leading placeholder option so the field starts unselected.
    const ph = el("option", { value: "", text: q.placeholder || "Select…" });
    ph.disabled = true;
    ph.selected = true;
    sel.append(ph);
    (q.options || []).forEach((opt) => sel.append(el("option", { value: opt, text: opt })));
    return sel;
  }

  // Radio (pick one) or checkbox (pick many) group from options.
  function choiceGroup(q, multiple) {
    const name = nextId();
    const group = el("div", {
      class: "appchoices",
      role: multiple ? "group" : "radiogroup",
      "aria-label": q.label,
    });
    (q.options || []).forEach((opt) => {
      const input = el("input", {
        class: "appopt-input",
        type: multiple ? "checkbox" : "radio",
        name,
        value: opt,
      });
      group.append(el("label", { class: "appopt" }, [input, el("span", { text: opt })]));
    });
    return group;
  }

  // A bare checkbox with no options = a single acknowledgement/consent; the label IS the
  // statement, shown beside the box rather than above it.
  function consentControl(q, id) {
    const input = el("input", { id, class: "appopt-input", type: "checkbox" });
    const lab = el("label", { class: "appopt appconsent", for: id }, [
      input,
      el("span", { text: q.label }),
    ]);
    if (q.required) lab.append(el("span", { class: "req", "aria-hidden": "true", text: " *" }));
    return lab;
  }

  function fileControl(q, id) {
    return el("input", { id, class: "appinput appfile", type: "file" });
  }

  // Populate a built control with a saved answer, and lock it when the form is read-only. Only
  // text-entry answers are persisted by the web app, so `answer` is meaningful for the input/
  // textarea types; choice/file/consent get no value but are still disabled in read-only so nothing
  // looks editable. `control` may be the element itself or a wrapper (url field, choice group).
  function applyAnswer(control, q, answer, readOnly) {
    const type = q.type;
    const val = answer == null ? "" : String(answer);
    const find = (sel) =>
      control.matches && control.matches(sel) ? control : control.querySelector(sel);

    if (type === "long_text") {
      const ta = find("textarea");
      if (ta) {
        ta.value = val;
        if (readOnly) ta.readOnly = true;
      }
      return;
    }
    if (type === "select") {
      const sel = find("select");
      if (sel) {
        if (val) sel.value = val;
        if (readOnly) sel.disabled = true;
      }
      return;
    }
    if (type === "radio" || type === "multi_select" || type === "checkbox") {
      const wanted = type === "radio" ? [val] : val ? val.split(/\s*,\s*/) : [];
      control.querySelectorAll(".appopt-input").forEach((inp) => {
        if (wanted.includes(inp.value)) inp.checked = true;
        if (readOnly) inp.disabled = true;
      });
      return;
    }
    if (type === "file") {
      const f = find("input"); // a file input's value can't be set programmatically; just lock it
      if (f && readOnly) f.disabled = true;
      return;
    }
    // short_text + every input-like type (number/url/email/tel/date)
    const inp = find("input");
    if (inp) {
      inp.value = val;
      if (readOnly) inp.readOnly = true;
    }
  }

  // Build one field block. `opts` = { onFlagChange, answer, readOnly }. `onFlagChange` fires when
  // the user toggles the star; `answer`/`readOnly` drive the saved read-only view.
  // Returns { node, wide } so the grid can span the right ones.
  function buildField(q, opts) {
    const onFlagChange = opts && opts.onFlagChange;
    const answer = opts ? opts.answer : undefined;
    const readOnly = !!(opts && opts.readOnly);
    const id = nextId();
    const type = q.type;
    // Reflect flagged state on the whole field so the importance reads at a glance.
    const star = flagButton(q, () => {
      field.classList.toggle("flagged", !!q.flagged);
      if (onFlagChange) onFlagChange();
    });
    let field;

    // Single consent checkbox: label lives inline with the box; the star sits at the row end.
    if (type === "checkbox" && (!q.options || !q.options.length)) {
      const consent = consentControl(q, id);
      if (readOnly) {
        const box = consent.matches("input") ? consent : consent.querySelector("input");
        if (box) box.disabled = true;
      }
      field = el("div", { class: "appfield wide" + (q.flagged ? " flagged" : "") }, [
        el("div", { class: "appconsent-row" }, [consent, star]),
      ]);
      const help = helpNode(q);
      if (help) field.append(help);
      return { node: field, wide: true };
    }

    let control;
    const wide = !COMPACT.has(type);
    switch (type) {
      case "long_text":
        control = textareaControl(q, id);
        break;
      case "select":
        control = selectControl(q, id);
        break;
      case "radio":
        control = choiceGroup(q, false);
        break;
      case "multi_select":
      case "checkbox":
        control = choiceGroup(q, true);
        break;
      case "file":
        control = fileControl(q, id);
        break;
      default:
        control = textControl(q, id); // short_text + all input-like types
    }

    applyAnswer(control, q, answer, readOnly);

    // Field header: the question label (primary) with its star aligned to the right.
    const head = el("div", { class: "appfield-head" }, [labelRow(q, id), star]);
    field = el("div", { class: "appfield" + (wide ? " wide" : "") + (q.flagged ? " flagged" : "") }, [
      head,
      control,
    ]);
    const help = helpNode(q);
    if (help) field.append(help);
    return { node: field, wide };
  }

  // render(questions, { onFlagChange, answers, readOnly }) → a grid node for the Application pane.
  // `answers` is a { questionId: value } map; `readOnly` locks every control (the saved-answer view).
  function render(questions, opts) {
    const onFlagChange = opts && opts.onFlagChange;
    const answers = (opts && opts.answers) || null;
    const readOnly = !!(opts && opts.readOnly);
    const grid = el("div", { class: "appgrid" + (readOnly ? " appgrid--readonly" : "") });
    (questions || []).forEach((q) =>
      grid.append(
        buildField(q, {
          onFlagChange,
          answer: answers ? answers[q.id] : undefined,
          readOnly,
        }).node,
      ),
    );
    return grid;
  }

  // Scoped styles. Everything sits under .apppane so it can't disturb the Details tab. Colours,
  // radii and rings come from the shared design tokens declared on :host in modal.js, so the
  // form stays consistent with the rest of the panel and there's one source of truth.
  function css() {
    return `
      /* Dense, single-system field grid: compact controls share a row, everything
         else spans full width. 16px between fields; collapses to one column when the
         side panel is narrow (minmax floor → no horizontal scroll). */
      .apppane .appgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
        gap:16px 12px;align-items:start;}
      /* Every field reserves a 2px left gutter (transparent) so flagging only colours it —
         no reflow, and every label stays left-aligned whether flagged or not. */
      .apppane .appfield{display:flex;flex-direction:column;gap:7px;min-width:0;
        border-left:2px solid transparent;padding-left:10px;transition:background .12s ease;}
      .apppane .appfield.wide{grid-column:1 / -1;}

      /* Field header: the question label leads; its flag toggle sits at the right edge, clear of
         the required asterisk (which stays with the label text on the left). */
      .apppane .appfield-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}

      /* Hierarchy: the QUESTION label is the primary element of each field — 13px/600 in full
         ink, so the eye reads "question → answer". Help text is the quiet supporting line; the
         answer values (inputs/options below) are 14px/normal weight — a deliberately different
         role from the label, not a competing heading. */
      .apppane .applabel{flex:1 1 auto;display:flex;flex-direction:row;align-items:baseline;gap:2px;
        flex-wrap:wrap;font-size:13px;font-weight:600;color:var(--ink);line-height:1.4;
        overflow-wrap:anywhere;}
      .apppane .req{color:var(--danger);font-weight:700;}
      .apppane .apphelp{margin:0;font-size:11.5px;line-height:1.45;color:var(--ink-3);}
      /* Read-only answer view caption: a quiet note above the locked fields explaining they mirror
         the web app. Sits between the header and the grid. */
      .apppane .apphint{margin:0 0 14px;font-size:12px;line-height:1.45;color:var(--ink-3);}

      /* Flagged for review: a filled amber flag + a subtle 2px amber left border. No background
         tint — the flag and border alone carry the meaning. */
      .apppane .appfield.flagged{border-left-color:var(--star);}

      /* Flag toggle: 32px click target, 16px icon, vertically aligned with the label's first
         line. Hidden until the field is hovered/focused (or already flagged) so the resting
         form stays quiet; fills amber when flagged. */
      .apppane .appflag{flex:0 0 auto;display:flex;align-items:center;justify-content:center;
        width:32px;height:32px;margin:-7px -7px -7px 0;padding:0;border:none;background:none;
        cursor:pointer;border-radius:7px;color:var(--ink-3);opacity:0;
        transition:opacity .12s ease,background .12s ease,color .12s ease,transform .1s ease;}
      .apppane .appfield:hover .appflag,
      .apppane .appfield:focus-within .appflag,
      .apppane .appflag:focus-visible,
      .apppane .appfield.flagged .appflag{opacity:1;}
      .apppane .appflag:hover{background:var(--bg-hover);color:var(--star-ink);}
      .apppane .appflag:active{transform:scale(.9);}
      .apppane .appflag.on{color:var(--star);}
      .apppane .appflag svg{width:16px;height:16px;}
      .apppane .appflag:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}

      /* Inputs/selects/dates: one shared 40px control with 8px radius + 1px border. */
      .apppane .appinput{width:100%;min-height:40px;font-family:var(--font);font-size:14px;font-weight:400;
        color:var(--ink);padding:9px 12px;border:1px solid var(--line-strong);
        border-radius:var(--r2);background:var(--bg);
        transition:border-color .12s ease,box-shadow .12s ease;}
      .apppane .appinput::placeholder{color:var(--ink-3);}
      .apppane .appinput:hover{border-color:var(--ink-3);}
      .apppane .appinput:focus-visible{outline:none;border-color:var(--accent);box-shadow:var(--ring);}
      .apppane .appinput:disabled{background:var(--bg-sunken);color:var(--ink-3);cursor:not-allowed;
        border-color:var(--line);}
      /* Read-only answer view: a sunken, non-editable control that still shows full-ink text and a
         text cursor, so saved answers stay easy to read and select/copy (the point of the view). */
      .apppane .appinput[readonly]{background:var(--bg-sunken);border-color:var(--line);cursor:text;}
      .apppane .appinput[readonly]:hover{border-color:var(--line);}
      .apppane .appinput[readonly]:focus-visible{border-color:var(--accent);box-shadow:var(--ring);}
      .apppane .apptext{min-height:164px;height:auto;resize:vertical;line-height:1.5;}
      .apppane .appselect{appearance:none;-webkit-appearance:none;cursor:pointer;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237a8088' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
        background-repeat:no-repeat;background-position:right 10px center;padding-right:32px;}
      /* url field: a leading link glyph inside the input marks it as a link field. */
      .apppane .appinput-wrap{position:relative;display:block;width:100%;}
      .apppane .appinput-ic{position:absolute;left:11px;top:50%;transform:translateY(-50%);
        display:flex;color:var(--ink-3);pointer-events:none;}
      .apppane .appinput-ic svg{width:15px;height:15px;}
      .apppane .appinput--icon{padding-left:34px;}

      /* File / resume picker: a roomy control with a clearly-padded "Choose file" button and
         comfortable spacing before the filename text. */
      .apppane .appfile{display:flex;align-items:center;min-height:44px;padding:6px 8px;cursor:pointer;
        font-size:12.5px;color:var(--ink-3);}
      .apppane .appfile::file-selector-button{font-family:var(--font);font-size:12.5px;font-weight:600;
        margin-right:12px;padding:9px 16px;border:1px solid var(--line-strong);border-radius:var(--r2);
        background:var(--bg-sunken);color:var(--ink-2);cursor:pointer;
        transition:background .12s ease,border-color .12s ease,color .12s ease;}
      .apppane .appfile::file-selector-button:hover{background:var(--accent-bg);
        border-color:var(--accent);color:var(--accent-ink);}

      /* Choice pills (radio = pick one, checkbox = pick many) — same 40px control
         height as inputs so Yes/No and option groups read as one design system. */
      .apppane .appchoices{display:flex;flex-wrap:wrap;gap:8px;}
      .apppane .appopt{display:inline-flex;align-items:center;gap:8px;flex-direction:row;min-height:40px;
        font-size:13px;font-weight:500;color:var(--ink);cursor:pointer;padding:8px 13px;
        border:1px solid var(--line-strong);border-radius:var(--r2);background:var(--bg);
        transition:border-color .12s ease,background .12s ease,color .12s ease;}
      .apppane .appopt:hover{border-color:var(--accent);background:var(--bg-hover);}
      .apppane .appopt:has(.appopt-input:checked){border-color:var(--accent);
        background:var(--accent-bg);color:var(--accent-ink);}
      .apppane .appopt-input{flex:0 0 auto;width:15px;height:15px;margin:0;
        accent-color:var(--accent);cursor:pointer;}
      .apppane .appopt:focus-within{outline:2px solid var(--accent);outline-offset:2px;}

      /* Single consent checkbox: the statement (grows) with its star toggle at the row end. */
      .apppane .appconsent-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
      .apppane .appconsent-row .appconsent{flex:1 1 auto;}
      /* Single consent checkbox: a plain inline statement, not a bordered card. */
      .apppane .appconsent{align-items:flex-start;gap:9px;min-height:0;padding:2px 0;
        border:none;background:none;font-size:13px;font-weight:400;color:var(--ink-2);line-height:1.45;}
      .apppane .appconsent:hover{border:none;background:none;}
      .apppane .appconsent:has(.appopt-input:checked){border:none;background:none;color:var(--ink);}
      .apppane .appconsent .appopt-input{margin-top:2px;}
    `;
  }

  UI.applicationForm = { render, css };
})(typeof self !== "undefined" ? self : this);
