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

  // ===========================================================================================
  // Autofill engine — harvest the LIVE application page's input fields, then fill them from the
  // plan the backend returns (semantic match of saved questions → page fields). This runs in the
  // content-script world, so `document` is the HOST page (the drawer is in a shadow root, so a
  // document-level query never sees the extension's own controls). All DOM-writing lives here;
  // the backend owns matching, this owns harvesting + filling. Files are out of scope (never
  // harvested or filled).
  // ===========================================================================================

  const MAX_FIELDS = 200; // bound a pathological page (backend also caps at 300)
  const MAX_OPTIONS = 60;
  const LABEL_CAP = 120;

  // Input types we never autofill: structural/non-answer, file (out of scope), and password (never).
  const NON_FILLABLE_INPUT = new Set([
    "hidden", "submit", "button", "image", "reset", "file", "password", "color", "range",
  ]);

  // A custom choice widget (segmented control, pill group, button radios) renders its options as
  // clickable elements, not native inputs — and often backs them with a hidden, id-less proxy input.
  // We treat a small LABELLED cluster of these as a choice field and fill by CLICKING the option,
  // which drives whatever state the page's framework manages. Generic — no per-site selectors.
  const OPTION_SELECTOR = "button, [role=button], [role=radio], [role=option]";
  const MAX_GROUP_OPTIONS = 12; // a labelled cluster larger than this isn't one question
  const GROUP_CLIMB = 4; // how far to climb to find an option's tightest group container

  // Opaque tokens (UUIDs, hashes, all-digits) make useless labels — skip them so resolution falls
  // through to real text (proximity) instead of labelling a field "20bb1c7e 73a3 4031".
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function looksOpaque(s) {
    return !s || UUID_RE.test(s) || !/[a-z]/i.test(s) || /^[0-9a-f]{16,}$/i.test(s);
  }

  // One autofill cycle's state. `harvestMap` maps a per-scan field id → a fill descriptor (live
  // element(s) + a stable cross-scan key). `undoByKey` maps a field's stable key → the closure that
  // restores its pre-autofill state, captured the first time we filled it (so Undo survives repeat
  // Autofills and reverts the right fields). `registry` persists "what we wrote" across re-scans so a
  // repeat Autofill is idempotent and can tell our own value from content the user typed. All DOM
  // reads/writes are delegated to the tested fill engine at UI.fill (lib/field-adapters.js).
  let harvestMap = null;
  let undoByKey = new Map();
  let registry = null;

  // ---- text helpers ----
  function textOf(node) {
    return ((node && node.textContent) || "").replace(/\s+/g, " ").trim();
  }
  function cap(s) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > LABEL_CAP ? s.slice(0, LABEL_CAP) : s;
  }
  function humanize(s) {
    return String(s)
      .replace(/\[[^\]]*\]/g, " ") // drop array-ish suffixes like field[name]
      .replace(/[_\-.]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // split camelCase
      .replace(/\s+/g, " ")
      .trim();
  }
  function cssEsc(s) {
    return root.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&");
  }
  function idsText(ids) {
    return ids
      .split(/\s+/)
      .map((id) => {
        const n = document.getElementById(id);
        return n ? textOf(n) : "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  // Nearest preceding <label>/<legend>/heading within the control's field wrapper. Forms put the
  // question text in a sibling/heading above the control — especially custom widgets that have no
  // linked label — so this DOM-proximity pass recovers it generally, with no per-site selectors.
  function proximityLabel(el) {
    let node = el;
    for (let up = 0; up < 6 && node; up++) {
      const parent = node.parentElement;
      if (!parent) break;
      let found = "";
      for (const ch of parent.children) {
        if (ch === node || ch.contains(node)) {
          if (found) return cap(found);
          break;
        }
        if (/^(LABEL|LEGEND|H[1-6])$/.test(ch.tagName) || ch.getAttribute("role") === "heading") {
          const t = textOf(ch);
          if (t) found = t; // keep the closest heading/label that sits above the control
        }
      }
      if (found) return cap(found);
      node = parent;
    }
    return "";
  }

  // ---- label resolution (standard ARIA/HTML semantics + DOM proximity — no per-site selectors) ----
  // Priority: aria-labelledby → aria-label → <label for=id|name> → wrapping <label> → nearest
  // preceding label/heading → placeholder → title → humanized (non-opaque) name/id. Returns "" when
  // nothing legible is found (the field is then dropped).
  function labelForControl(el) {
    const ll = el.getAttribute && el.getAttribute("aria-labelledby");
    if (ll) { const t = idsText(ll); if (t) return cap(t); }
    const al = el.getAttribute && el.getAttribute("aria-label");
    if (al && al.trim()) return cap(al);
    // A custom widget often links its <label for> to the control's `name` (its hidden proxy has no id).
    const idName = el.id || (el.getAttribute && el.getAttribute("name"));
    if (idName) {
      const lab = document.querySelector(`label[for="${cssEsc(idName)}"]`);
      if (lab) { const t = textOf(lab); if (t) return cap(t); }
    }
    const wrap = el.closest && el.closest("label");
    if (wrap) { const t = textOf(wrap); if (t) return cap(t); }
    const prox = proximityLabel(el);
    if (prox) return prox;
    const ph = el.getAttribute && el.getAttribute("placeholder");
    if (ph && ph.trim()) return cap(ph);
    const ti = el.getAttribute && el.getAttribute("title");
    if (ti && ti.trim()) return cap(ti);
    const nm = (el.getAttribute && el.getAttribute("name")) || el.id;
    if (nm && !looksOpaque(nm)) return cap(humanize(nm));
    return "";
  }

  // Group label for a native radio/checkbox set: fieldset legend, aria-labelled wrapping group,
  // nearest preceding label/heading, then the shared input name (only if legible).
  function groupLabel(inputs) {
    const first = inputs[0];
    const fs = first.closest && first.closest("fieldset");
    if (fs) { const lg = fs.querySelector("legend"); if (lg) { const t = textOf(lg); if (t) return cap(t); } }
    const grp = first.closest && first.closest("[role=radiogroup],[role=group],[aria-labelledby],[aria-label]");
    if (grp) {
      const ll = grp.getAttribute("aria-labelledby");
      if (ll) { const t = idsText(ll); if (t) return cap(t); }
      const al = grp.getAttribute("aria-label");
      if (al && al.trim()) return cap(al);
    }
    const prox = proximityLabel(first);
    if (prox) return prox;
    if (first.name && !looksOpaque(first.name)) return cap(humanize(first.name));
    return "";
  }

  // Label for a custom option-cluster container: its own aria label, else nearest preceding text.
  function containerLabel(container) {
    const al = container.getAttribute("aria-label");
    if (al && al.trim()) return cap(al);
    const ll = container.getAttribute("aria-labelledby");
    if (ll) { const t = idsText(ll); if (t) return cap(t); }
    return proximityLabel(container);
  }

  // The label for one option (a single radio/checkbox), preferring its own associated label text.
  function optionLabel(input) {
    return labelForControl(input) || input.value || "";
  }

  // The selectable, non-placeholder options of a <select>, as { value, label }.
  function selectOptions(sel) {
    const out = [];
    for (const o of sel.options) {
      if (o.disabled) continue;
      if (o.value === "") continue; // a "" value is the placeholder/empty row
      out.push({ value: o.value, label: textOf(o) || o.value });
      if (out.length >= MAX_OPTIONS) break;
    }
    return out;
  }

  // ---- visibility / fillability ----
  function isVisible(el) {
    if (!el) return false;
    const style = root.getComputedStyle ? getComputedStyle(el) : null;
    if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse"))
      return false;
    if (el.getClientRects && el.getClientRects().length === 0) return false; // not rendered
    return true;
  }
  // A custom dropdown (ARIA combobox / react-select / Greenhouse "flyout"): role=combobox, or an
  // input that pops a listbox/menu, or one with list autocomplete. Filled by driving the widget.
  function isCombobox(el) {
    if (el.getAttribute("role") === "combobox") return true;
    const hp = (el.getAttribute("aria-haspopup") || "").toLowerCase();
    if (hp === "listbox" || hp === "menu" || hp === "tree" || hp === "grid" || hp === "true") return true;
    const ac = (el.getAttribute("aria-autocomplete") || "").toLowerCase();
    return ac === "list" || ac === "both";
  }

  function isFillable(el) {
    if (el.isContentEditable) return isVisible(el);
    const tag = el.tagName;
    if (tag === "TEXTAREA") return !el.disabled && !el.readOnly && isVisible(el);
    if (tag === "SELECT") return !el.disabled && isVisible(el);
    if (tag === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      if (NON_FILLABLE_INPUT.has(t)) return false;
      if (el.disabled) return false;
      // Keep readonly comboboxes (selection-only dropdowns); exclude other readonly text inputs.
      if (el.readOnly && t !== "checkbox" && t !== "radio" && !isCombobox(el)) return false;
      return isVisible(el);
    }
    return false;
  }

  function pushGroup(map, key, el) {
    const arr = map.get(key);
    if (arr) arr.push(el);
    else map.set(key, [el]);
  }

  // Walk the host page and emit the fillable fields as DomField descriptors. Builds `harvestMap`
  // (id → live element[s]) for the subsequent fill. Returns { fields, total } — `fields` carries
  // only labels/kinds/option-labels (no HTML, no values), so the embedding payload stays tiny.
  function harvestFields() {
    clearHighlights();
    harvestMap = new Map();
    const fields = [];
    let seq = 0;
    const nextFid = () => "f" + ++seq;

    // ---- Phase 1: custom option groups (button / role-based choice widgets) ----
    // A labelled cluster of >=2 clickable "option" elements is a choice field we fill by clicking.
    // Catches segmented Yes/No, pill selectors, and button radios that aren't native inputs.
    const consumedContainers = [];
    const optionCandidates = Array.from(document.querySelectorAll(OPTION_SELECTOR))
      .filter((el) => isVisible(el))
      .filter((el) => { const t = textOf(el); return t && t.length <= 40; })
      .filter((el) => !el.querySelector(OPTION_SELECTOR)); // leaf options only (not a wrapper)
    const candSet = new Set(optionCandidates);
    const countOptionsIn = (node) => {
      let c = 0;
      for (const o of candSet) if (node.contains(o)) { c++; if (c > MAX_GROUP_OPTIONS + 1) break; }
      return c;
    };
    // The tightest non-<form> ancestor holding >=2 option candidates is the group container.
    const groupContainerOf = (el) => {
      let node = el.parentElement;
      for (let up = 0; up < GROUP_CLIMB && node; up++) {
        if (node.tagName === "FORM") return null;
        if (countOptionsIn(node) >= 2) return node;
        node = node.parentElement;
      }
      return null;
    };
    const byContainer = new Map(); // object-keyed by identity
    for (const o of optionCandidates) {
      const c = groupContainerOf(o);
      if (c) pushGroup(byContainer, c, o);
    }
    // Smallest clusters first, so a tight Yes/No claims its buttons before a looser ancestor cluster.
    const clusters = Array.from(byContainer.entries())
      .map(([container, options]) => ({ container, options }))
      .sort((a, b) => a.options.length - b.options.length);
    const consumedOpt = new Set();
    for (const { container, options } of clusters) {
      const live = options.filter((o) => !consumedOpt.has(o));
      if (live.length < 2 || live.length > MAX_GROUP_OPTIONS) continue;
      const label = containerLabel(container);
      if (!label) continue; // no question label → not a field (nav/action button clusters)
      live.forEach((o) => consumedOpt.add(o));
      consumedContainers.push(container);
      const fid = nextFid();
      const bopts = live.map((el) => ({ el, label: textOf(el) }));
      harvestMap.set(fid, { kind: "buttons", options: bopts, key: fieldKey("buttons", label, null, bopts.map((o) => o.label)) });
      // Reported to the backend as a single-choice field (kind stays within the validated enum).
      fields.push({
        id: fid,
        label,
        kind: "radio",
        options: live.map((el) => { const t = textOf(el); return { value: t, label: t }; }).slice(0, MAX_OPTIONS),
      });
    }
    const inConsumed = (el) => consumedContainers.some((c) => c.contains(el));

    // ---- Phase 2: native controls (skip hidden proxies inside an option widget) ----
    const candidates = Array.from(
      document.querySelectorAll("input, textarea, select, [contenteditable]"),
    ).filter((el) => isFillable(el) && !inConsumed(el));

    // Group radios by name (mutually exclusive); group checkboxes only when 2+ share a name
    // ("select all that apply"). A lone checkbox is its own consent-style field.
    const radiosByName = new Map();
    const checksByName = new Map();
    const consumed = new Set();
    for (const el of candidates) {
      if (el.tagName !== "INPUT") continue;
      const t = (el.type || "").toLowerCase();
      if (t === "radio") pushGroup(radiosByName, el.name || "__r" + nextFid(), el);
      else if (t === "checkbox" && el.name) pushGroup(checksByName, el.name, el);
    }

    const emitGroup = (inputs, kind) => {
      const fid = nextFid();
      const glabel = groupLabel(inputs);
      // Carry the live input alongside its value+label so the adapter can click the right option.
      const opts = inputs.map((i) => ({ el: i, value: i.value, label: optionLabel(i) }));
      harvestMap.set(fid, { kind, options: opts, key: fieldKey(kind, glabel, inputs[0], opts.map((o) => o.label)) });
      fields.push({
        id: fid,
        label: glabel,
        kind,
        options: opts.map((o) => ({ value: o.value, label: o.label })).slice(0, MAX_OPTIONS),
        required: inputs.some((i) => i.required),
      });
      inputs.forEach((i) => consumed.add(i));
    };
    for (const [, inputs] of radiosByName) if (inputs.length) emitGroup(inputs, "radio");
    for (const [, inputs] of checksByName) if (inputs.length >= 2) emitGroup(inputs, "checkbox");

    // Singles: text/textarea/select/contenteditable, plus any standalone checkbox (consent-style).
    for (const el of candidates) {
      if (consumed.has(el)) continue;
      let kind = null;
      let options;
      if (el.isContentEditable) kind = "contenteditable";
      else if (el.tagName === "TEXTAREA") kind = "textarea";
      else if (el.tagName === "SELECT") { kind = "select"; options = selectOptions(el); }
      else if (el.tagName === "INPUT") {
        const t = (el.type || "text").toLowerCase();
        if (t === "checkbox") { kind = "checkbox"; options = []; } // standalone consent toggle
        else if (isCombobox(el)) kind = "combobox"; // custom dropdown (ARIA combobox), not free text
        else kind = "text";
      }
      if (!kind) continue;
      const fid = nextFid();
      const flabel = labelForControl(el);
      harvestMap.set(fid, { kind, el, key: fieldKey(kind, flabel, el, options && options.map((o) => o.label)) });
      // A combobox is filled by driving the widget (open → pick the matching option). The backend
      // just matches it like any field and hands back the answer text, so report it as "text".
      const f = { id: fid, label: flabel, kind: kind === "combobox" ? "text" : kind };
      if (options) f.options = options;
      if (el.required) f.required = true;
      fields.push(f);
    }

    // Drop unlabelled fields (nothing to match on) and bound the count.
    const cleaned = fields.filter((f) => f.label && f.label.trim()).slice(0, MAX_FIELDS);
    return { fields: cleaned, total: cleaned.length };
  }

  // ---- fill: delegate every DOM write to the tested fill engine (UI.fill / lib/field-adapters.js) ----
  // harvestFields() built `harvestMap` (per-scan fieldId → descriptor). For each backend match we
  // build the matching FieldAdapter and hand it to fillField, which speaks each framework's protocol
  // (native setter + real events, click for choices, open+pick for comboboxes), is idempotent (skips
  // already-correct fields, never clobbers user edits), verifies the write stuck, and returns a
  // restore closure for Undo. No raw write logic lives here anymore.

  // Stable, cross-scan identity for a field so the registry survives re-renders (best-effort:
  // kind + label + name/id + option labels). Purely structural — no per-site selectors.
  function fieldKey(kind, label, el, optionLabels) {
    const N = UI.fill.norm;
    const name = el && el.getAttribute ? el.getAttribute("name") || el.id || "" : "";
    const optsig = optionLabels && optionLabels.length ? optionLabels.map(N).join("|") : "";
    return [kind, N(label), N(name), optsig].join("::");
  }

  // Highlights were removed; kept as a no-op so the modal's clear() hook and harvest can call it.
  function clearHighlights() {}

  // Apply a backend plan to the harvested page. Sequential (await) because a combobox opens a flyout
  // and picks an option — one widget at a time avoids cross-widget races. Returns the summary the
  // modal renders: `real`/`def` = fields now holding a real answer / a placeholder default (whether
  // written this pass or already correct); `skipped` = left as the user had them; `failedCount` = the
  // write didn't stick.
  async function applyAutofillPlan(plan) {
    registry = registry || new UI.fill.FilledRegistry();
    let real = 0;
    let def = 0;
    let skipped = 0;
    let failed = 0;
    const matched = (plan && plan.matched) || [];
    for (const m of matched) {
      const entry = harvestMap && harvestMap.get(m.fieldId);
      const adapter = entry && UI.fill.createAdapter(entry);
      if (!adapter) {
        failed++;
        continue;
      }
      const key = (entry && entry.key) || "__" + m.fieldId;
      let res;
      try {
        res = await UI.fill.fillField(adapter, m, { registry, key: entry.key });
      } catch (_) {
        res = { status: "failed" };
      }
      switch (res.status) {
        case "filled":
          // Keep the FIRST restore for a field (its pre-autofill state), so Undo still reverts it
          // after a repeat Autofill where the field comes back "already" (no new closure).
          if (res.undo && !undoByKey.has(key)) undoByKey.set(key, res.undo);
          m.isDefault ? def++ : real++;
          break;
        case "already":
          m.isDefault ? def++ : real++;
          break;
        case "skipped-user":
          undoByKey.delete(key); // the user owns this field now — Undo must not revert their edit
          skipped++;
          break;
        case "empty-target":
          break; // nothing to write for this match
        default:
          failed++;
      }
    }
    return { real, def, skipped, failedCount: failed, unmatched: (plan && plan.unmatched) || [] };
  }

  // Undo everything autofill currently owns: run each field's pre-autofill restore (captured the
  // first time we filled it) and forget them. Persists across repeat Autofills; fields the user has
  // since edited were dropped from the set above, so their edits survive Undo.
  function undoAutofill() {
    for (const restore of undoByKey.values()) {
      try {
        restore();
      } catch (_) {}
    }
    undoByKey.clear();
  }

  // ---- questions harvest (for the TIERED, non-LLM application extractor) --------------------------
  // Like harvestFields(), but extraction-oriented, not fill-oriented: it builds NO harvestMap, INCLUDES
  // file inputs (a resume upload IS a question), and carries the native input type + placeholder so the
  // backend can type each field precisely. Reuses the same generic label heuristics (no per-site code).
  // Returns { fields, total } where each field is { id, label, kind, inputType?, options?(string[]),
  // required?, placeholder? }. The backend maps these to typed questions and gates out page noise.
  function isQuestionControl(el) {
    if (el.isContentEditable) return isVisible(el);
    const tag = el.tagName;
    if (tag === "TEXTAREA") return !el.disabled && !el.readOnly && isVisible(el);
    if (tag === "SELECT") return !el.disabled && isVisible(el);
    if (tag === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      if (t === "file") return !el.disabled && isVisible(el); // a file upload is a real question
      if (NON_FILLABLE_INPUT.has(t)) return false;
      if (el.disabled) return false;
      if (el.readOnly && t !== "checkbox" && t !== "radio" && !isCombobox(el)) return false;
      return isVisible(el);
    }
    return false;
  }

  function harvestQuestions() {
    const fields = [];
    let seq = 0;
    const nextQid = () => "q" + ++seq;
    // Element → field-id map so capture v2 can stamp the SAME q<N> ids into its block doc.
    // Group members all map to the group's one id (the block doc emits one field block per group).
    const controlIds = new WeakMap();

    // Phase 1: custom option-button clusters → a single-choice question (same detection as autofill).
    const consumedContainers = [];
    const optionCandidates = Array.from(document.querySelectorAll(OPTION_SELECTOR))
      .filter((el) => isVisible(el))
      .filter((el) => { const t = textOf(el); return t && t.length <= 40; })
      .filter((el) => !el.querySelector(OPTION_SELECTOR));
    const candSet = new Set(optionCandidates);
    const countOptionsIn = (node) => {
      let c = 0;
      for (const o of candSet) if (node.contains(o)) { c++; if (c > MAX_GROUP_OPTIONS + 1) break; }
      return c;
    };
    const groupContainerOf = (el) => {
      let node = el.parentElement;
      for (let up = 0; up < GROUP_CLIMB && node; up++) {
        if (node.tagName === "FORM") return null;
        if (countOptionsIn(node) >= 2) return node;
        node = node.parentElement;
      }
      return null;
    };
    const byContainer = new Map();
    for (const o of optionCandidates) { const c = groupContainerOf(o); if (c) pushGroup(byContainer, c, o); }
    const clusters = Array.from(byContainer.entries())
      .map(([container, options]) => ({ container, options }))
      .sort((a, b) => a.options.length - b.options.length);
    const consumedOpt = new Set();
    for (const { container, options } of clusters) {
      const live = options.filter((o) => !consumedOpt.has(o));
      if (live.length < 2 || live.length > MAX_GROUP_OPTIONS) continue;
      const label = containerLabel(container);
      if (!label) continue;
      live.forEach((o) => consumedOpt.add(o));
      consumedContainers.push(container);
      fields.push({ id: nextQid(), label, kind: "radio", options: live.map((el) => textOf(el)).slice(0, MAX_OPTIONS) });
    }
    const inConsumed = (el) => consumedContainers.some((c) => c.contains(el));

    // Phase 2: native controls + file inputs.
    const candidates = Array.from(
      document.querySelectorAll("input, textarea, select, [contenteditable]"),
    ).filter((el) => isQuestionControl(el) && !inConsumed(el));

    const radiosByName = new Map();
    const checksByName = new Map();
    const consumed = new Set();
    for (const el of candidates) {
      if (el.tagName !== "INPUT") continue;
      const t = (el.type || "").toLowerCase();
      if (t === "radio") pushGroup(radiosByName, el.name || "__r" + nextQid(), el);
      else if (t === "checkbox" && el.name) pushGroup(checksByName, el.name, el);
    }
    const emitGroup = (inputs, kind) => {
      const f = {
        id: nextQid(),
        label: groupLabel(inputs),
        kind,
        options: inputs.map((i) => optionLabel(i)).slice(0, MAX_OPTIONS),
      };
      if (inputs.some((i) => i.required)) f.required = true;
      fields.push(f);
      inputs.forEach((i) => controlIds.set(i, f.id));
      inputs.forEach((i) => consumed.add(i));
    };
    for (const [, inputs] of radiosByName) if (inputs.length) emitGroup(inputs, "radio");
    for (const [, inputs] of checksByName) if (inputs.length >= 2) emitGroup(inputs, "checkbox");

    for (const el of candidates) {
      if (consumed.has(el)) continue;
      let kind = null;
      let options;
      let inputType;
      if (el.isContentEditable) kind = "contenteditable";
      else if (el.tagName === "TEXTAREA") kind = "textarea";
      else if (el.tagName === "SELECT") { kind = "select"; options = selectOptions(el).map((o) => o.label); }
      else if (el.tagName === "INPUT") {
        const t = (el.type || "text").toLowerCase();
        if (t === "file") kind = "file";
        else if (t === "checkbox") kind = "checkbox"; // standalone consent toggle
        else if (isCombobox(el)) kind = "combobox";
        else { kind = "text"; inputType = t; }
      }
      if (!kind) continue;
      const f = { id: nextQid(), label: labelForControl(el), kind };
      if (inputType) f.inputType = inputType;
      if (options && options.length) f.options = options;
      if (el.required) f.required = true;
      const ph = el.getAttribute && el.getAttribute("placeholder");
      if (ph && ph.trim()) f.placeholder = cap(ph);
      fields.push(f);
      controlIds.set(el, f.id);
    }

    const cleaned = fields.filter((f) => f.label && f.label.trim()).slice(0, MAX_FIELDS);
    // controlIds may still map elements whose fields were dropped by the label filter above —
    // capture resolves ids against the CLEANED field list, so those fall back to legacy markers.
    return { fields: cleaned, total: cleaned.length, controlIds };
  }

  UI.autofill = {
    harvest: harvestFields,
    harvestQuestions,
    apply: applyAutofillPlan,
    undo: undoAutofill,
    clear: clearHighlights,
  };
})(typeof self !== "undefined" ? self : this);
