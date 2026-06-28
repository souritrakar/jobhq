// Autofill fill engine — the DOM-interaction layer. Everything that actually READS or WRITES a
// control on the host page lives here, behind a uniform FieldAdapter interface, so the rest of the
// autofill code thinks only in terms of "questions" and "answers", never raw widget quirks.
//
// Two ideas drive the design:
//
//   1. Speak the framework's protocol, don't replay a macro. Setting `el.value = x` only mutates the
//      raw DOM node; a React/Vue controlled input keeps its own state and ignores it. So we set
//      through the prototype's NATIVE value setter (bypassing the framework's instance-level value
//      tracker) and dispatch real bubbling input/change events, then blur so validation-on-blur runs.
//      Radios/checkboxes are driven by a real click (its activation behaviour is what frameworks
//      listen for), custom widgets by a full pointer sequence.
//
//   2. Idempotent + non-destructive. Forms re-render constantly (validation, step transitions), so a
//      fill pass must be safe to run repeatedly: never re-write a field that already holds the
//      target (no wasted events, no duplication), and never clobber content the user typed. Each
//      write is verified by reading the value back, and escalated through fallback strategies if it
//      didn't stick — so a stubborn masked input fails loudly (reported) instead of silently.
//
// No site-specific selectors anywhere: adapters are chosen by control SHAPE (native input, select,
// radio group, ARIA combobox, contenteditable, custom option cluster), which generalises across ATSs.
//
// Loaded as a classic content script (attaches to JobTracker.ui.fill) and also exported for unit
// tests (jsdom). createElement-only; never innerHTML.
(function (root, factory) {
  "use strict";
  const api = factory();
  const NS = (root.JobTracker = root.JobTracker || {});
  NS.ui = NS.ui || {};
  NS.ui.fill = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // ---- text helpers ----------------------------------------------------------
  function textOf(node) {
    return ((node && node.textContent) || "").replace(/\s+/g, " ").trim();
  }
  // Lenient normalisation for matching/equality: lowercase, punctuation→space, collapse, trim. Makes
  // "New York" == " new york " and "F-1" == "f 1" so cosmetic differences never block idempotency.
  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  function normEq(a, b) {
    return norm(a) === norm(b);
  }
  // Answer truthiness for consent-style checkboxes ("yes"/"true"/"1" → checked).
  function truthy(v) {
    const s = String(v == null ? "" : v)
      .trim()
      .toLowerCase();
    return s !== "" && s !== "false" && s !== "no" && s !== "0" && s !== "off";
  }

  // ---- target accessors (a "target" is one backend plan instruction: { value, optionValues }) ----
  function targetText(t) {
    return !t || t.value == null ? null : String(t.value);
  }
  function targetOptionValues(t) {
    if (!t) return [];
    if (Array.isArray(t.optionValues) && t.optionValues.length) return t.optionValues.map(String);
    if (t.value != null && t.value !== "") return [String(t.value)];
    return [];
  }
  // Does this target carry anything to write at all? (else fillField reports "empty-target")
  function isActionable(t) {
    return !!(
      t &&
      ((t.value != null && t.value !== "") || (Array.isArray(t.optionValues) && t.optionValues.length))
    );
  }

  // Minimal, generic value coercion to the control's native type — NOT site rules. A number input
  // rejects a non-numeric string (becomes ""), so strip currency/units/spaces; everything else is
  // passed through untouched (the read-back + escalation handles formats we can't predict).
  function coerceValue(el, value) {
    if (value == null) return value;
    const s = String(value);
    if (el && el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "number") {
      return s.replace(/[^\d.+-]/g, "");
    }
    return s;
  }

  // ---- visibility (layout-independent so it works in shadow roots, portals, and jsdom) ----
  function isShown(el) {
    if (!el || !el.ownerDocument) return false;
    const win = el.ownerDocument.defaultView;
    const st = win && win.getComputedStyle ? win.getComputedStyle(el) : null;
    if (st && (st.display === "none" || st.visibility === "hidden" || st.visibility === "collapse"))
      return false;
    return true;
  }

  // ---- event primitives ------------------------------------------------------
  function viewOf(el) {
    return (
      (el.ownerDocument && el.ownerDocument.defaultView) || (typeof self !== "undefined" ? self : globalThis)
    );
  }
  function focusNoScroll(el) {
    try {
      if (el.focus) el.focus({ preventScroll: true });
    } catch (_) {
      try {
        el.focus();
      } catch (__) {}
    }
  }
  // Blur so validation-on-blur fires, and a bubbling focusout so delegated onBlur handlers (React
  // attaches focusout at the root) run too.
  function commitBlur(el) {
    try {
      if (el.blur) el.blur();
    } catch (_) {}
    const win = viewOf(el);
    try {
      el.dispatchEvent(new win.FocusEvent("focusout", { bubbles: true }));
    } catch (_) {
      try {
        el.dispatchEvent(new win.Event("focusout", { bubbles: true }));
      } catch (__) {}
    }
  }
  function dispatchBeforeInput(el, value) {
    const win = viewOf(el);
    try {
      el.dispatchEvent(
        new win.InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: String(value),
        }),
      );
    } catch (_) {
      try {
        el.dispatchEvent(new win.Event("beforeinput", { bubbles: true, cancelable: true }));
      } catch (__) {}
    }
  }

  // The native value setter from the element's PROTOTYPE — bypasses any instance-level `value`
  // accessor a framework installed (React's _valueTracker), which is what lets React notice the
  // change on the following input event. Then fire bubbling input (a real InputEvent) + change.
  function setNativeValue(el, value) {
    const win = viewOf(el);
    const proto =
      el instanceof win.HTMLTextAreaElement
        ? win.HTMLTextAreaElement.prototype
        : el instanceof win.HTMLSelectElement
          ? win.HTMLSelectElement.prototype
          : win.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    try {
      el.dispatchEvent(
        new win.InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }),
      );
    } catch (_) {
      el.dispatchEvent(new win.Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new win.Event("change", { bubbles: true }));
  }

  // A full pointer→mouse→click sequence. Custom widgets (segmented controls, comboboxes) listen on
  // pointerdown/mousedown and ignore a bare click; native controls also activate on the final click.
  function clickLikeUser(el) {
    const win = viewOf(el);
    // No `view:` — some host realms (and vitest's jsdom) fail jsdom's `view instanceof Window` brand
    // check inside the MouseEvent constructor, which would throw and drop the whole sequence. Dispatch
    // and listeners don't need it.
    const opts = { bubbles: true, cancelable: true, button: 0 };
    const P = win.PointerEvent || win.MouseEvent;
    const M = win.MouseEvent;
    const fire = (type, Ctor) => {
      try {
        el.dispatchEvent(new Ctor(type, opts));
      } catch (_) {
        try {
          el.dispatchEvent(new M(type, opts));
        } catch (__) {}
      }
    };
    focusNoScroll(el);
    fire("pointerover", P);
    fire("pointerenter", P);
    fire("pointerdown", P);
    fire("mousedown", M);
    fire("pointerup", P);
    fire("mouseup", M);
    fire("click", M);
  }
  // Native control activation (checkbox/radio): .click() runs the spec activation behaviour (toggle +
  // input + change), the most reliable path. Fall back to the pointer sequence if it throws.
  function nativeClick(el) {
    try {
      el.click();
    } catch (_) {
      clickLikeUser(el);
    }
  }

  // Best-effort "is this custom option currently chosen?" — common ARIA state + selected-ish classes.
  function isSelectedOption(el) {
    const a = (n) => el.getAttribute && el.getAttribute(n) === "true";
    if (a("aria-pressed") || a("aria-checked") || a("aria-selected")) return true;
    const cls = " " + String(el.className || "") + " ";
    return /(?:^|[\s_-])(selected|active|checked|current)(?:[\s_-]|$)/i.test(cls);
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Poll `fn` until it returns a truthy value or the deadline passes (~750ms). Returns immediately on
  // the first hit, so a control that's already ready costs nothing — replaces fixed sleeps for
  // async-rendering widgets (combobox flyouts).
  async function pollFor(fn, { tries = 15, intervalMs = 50 } = {}) {
    for (let i = 0; i < tries; i++) {
      const v = fn();
      if (v) return v;
      await wait(intervalMs);
    }
    return fn() || null;
  }

  // ===========================================================================
  // Adapters. Each wraps one control and exposes the same surface:
  //   isEmpty()           — at its default/unset state (safe to fill without clobbering)
  //   isFilledWith(t)     — already holds the target (idempotency / verification)
  //   snapshot()          — capture current state, return a restore() closure (for Undo)
  //   async write(t)      — framework-correct write, best-effort with escalation; returns "did it
  //                         stick" but fillField re-verifies via isFilledWith as the source of truth
  // ===========================================================================

  function textAdapter(el) {
    const isTextarea = el.tagName === "TEXTAREA";
    function value() {
      return String(el.value || "");
    }
    function stuck(v) {
      return normEq(value(), v);
    }
    return {
      kind: isTextarea ? "textarea" : "text",
      el,
      isEmpty() {
        return value().trim() === "";
      },
      isFilledWith(t) {
        const v = targetText(t);
        return v != null && stuck(coerceValue(el, v));
      },
      snapshot() {
        const prev = el.value;
        return () => setNativeValue(el, prev);
      },
      async write(t) {
        const raw = targetText(t);
        if (raw == null) return false;
        const v = coerceValue(el, raw);
        focusNoScroll(el);
        // Tier 1: native setter + input/change.
        setNativeValue(el, v);
        let ok = stuck(v);
        // Tier 2: gate with a beforeinput first (some editors/masks only accept gated input).
        if (!ok) {
          dispatchBeforeInput(el, v);
          setNativeValue(el, v);
          ok = stuck(v);
        }
        // Tier 3: clear then re-apply (controlled inputs that need a 0→value transition).
        if (!ok) {
          setNativeValue(el, "");
          dispatchBeforeInput(el, v);
          setNativeValue(el, v);
          ok = stuck(v);
        }
        commitBlur(el);
        return ok;
      },
    };
  }

  function contentEditableAdapter(el) {
    function value() {
      return String(el.textContent || "");
    }
    return {
      kind: "contenteditable",
      el,
      isEmpty() {
        return value().trim() === "";
      },
      isFilledWith(t) {
        const v = targetText(t);
        return v != null && normEq(value(), v);
      },
      snapshot() {
        const prev = el.textContent;
        return () => {
          el.textContent = prev;
          try {
            el.dispatchEvent(new (viewOf(el).InputEvent)("input", { bubbles: true }));
          } catch (_) {
            el.dispatchEvent(new (viewOf(el).Event)("input", { bubbles: true }));
          }
        };
      },
      async write(t) {
        const v = targetText(t);
        if (v == null) return false;
        focusNoScroll(el);
        selectAllText(el);
        let inserted = false;
        // Real browsers: execCommand('insertText') drives rich editors (Draft/Lexical/ProseMirror)
        // through their own input pipeline. jsdom no-ops it, so we fall back to textContent below.
        try {
          const doc = el.ownerDocument;
          if (doc && typeof doc.execCommand === "function") {
            dispatchBeforeInput(el, v);
            inserted = doc.execCommand("insertText", false, String(v));
          }
        } catch (_) {
          inserted = false;
        }
        if (!inserted || !normEq(value(), v)) {
          dispatchBeforeInput(el, v);
          el.textContent = String(v);
          try {
            el.dispatchEvent(
              new (viewOf(el).InputEvent)("input", {
                bubbles: true,
                inputType: "insertText",
                data: String(v),
              }),
            );
          } catch (_) {
            el.dispatchEvent(new (viewOf(el).Event)("input", { bubbles: true }));
          }
        }
        commitBlur(el);
        return normEq(value(), v);
      },
    };
  }

  function selectAllText(el) {
    try {
      const doc = el.ownerDocument;
      const range = doc.createRange();
      range.selectNodeContents(el);
      const sel = doc.defaultView.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
  }

  function selectAdapter(el) {
    function options() {
      return Array.from(el.options || []);
    }
    function findOption(vals) {
      for (const o of options()) if (vals.includes(o.value)) return o;
      for (const o of options()) if (vals.some((v) => normEq(v, textOf(o)))) return o;
      return null;
    }
    return {
      kind: "select",
      el,
      isEmpty() {
        return el.value === "";
      },
      isFilledWith(t) {
        const vals = targetOptionValues(t);
        if (!vals.length) return false;
        if (el.multiple) {
          const sel = Array.from(el.selectedOptions || []);
          return vals.every((v) => sel.some((o) => o.value === v || normEq(v, textOf(o))));
        }
        const cur = el.options[el.selectedIndex];
        return !!cur && (vals.includes(cur.value) || vals.some((v) => normEq(v, textOf(cur))));
      },
      snapshot() {
        const prev = options().map((o) => o.selected);
        return () => {
          options().forEach((o, i) => (o.selected = !!prev[i]));
          el.dispatchEvent(new (viewOf(el).Event)("change", { bubbles: true }));
        };
      },
      async write(t) {
        const vals = targetOptionValues(t);
        if (!vals.length) return false;
        if (el.multiple) {
          let any = false;
          for (const o of options()) {
            const on = vals.includes(o.value) || vals.some((v) => normEq(v, textOf(o)));
            if (on && !o.selected) {
              o.selected = true;
              any = true;
            }
          }
          if (any) el.dispatchEvent(new (viewOf(el).Event)("change", { bubbles: true }));
          return this.isFilledWith(t);
        }
        const opt = findOption(vals);
        if (!opt) return false;
        setNativeValue(el, opt.value);
        return el.value === opt.value;
      },
    };
  }

  // options: [{ el, value, label }]
  function radioAdapter(opts) {
    function match(vals) {
      for (const o of opts) if (vals.includes(o.value)) return o;
      for (const o of opts) if (vals.some((v) => normEq(v, o.label))) return o;
      return null;
    }
    return {
      kind: "radio",
      isEmpty() {
        return !opts.some((o) => o.el.checked);
      },
      isFilledWith(t) {
        const vals = targetOptionValues(t);
        if (!vals.length) return false;
        const o = match(vals);
        return !!(o && o.el.checked);
      },
      snapshot() {
        const prev = opts.find((o) => o.el.checked) || null;
        return () => {
          if (prev) nativeClick(prev.el);
          else opts.forEach((o) => (o.el.checked = false));
        };
      },
      async write(t) {
        const o = match(targetOptionValues(t));
        if (!o) return false;
        if (!o.el.checked) nativeClick(o.el);
        return o.el.checked;
      },
    };
  }

  // options: [{ el, value, label }] — "select all that apply"
  function checkboxGroupAdapter(opts) {
    function wanted(vals) {
      return opts.filter((o) => vals.includes(o.value) || vals.some((v) => normEq(v, o.label)));
    }
    return {
      kind: "checkbox",
      isEmpty() {
        return !opts.some((o) => o.el.checked);
      },
      isFilledWith(t) {
        const w = wanted(targetOptionValues(t));
        return w.length > 0 && w.every((o) => o.el.checked);
      },
      snapshot() {
        const prev = opts.map((o) => o.el.checked);
        return () => opts.forEach((o, i) => o.el.checked !== prev[i] && nativeClick(o.el));
      },
      async write(t) {
        const w = wanted(targetOptionValues(t));
        for (const o of w) if (!o.el.checked) nativeClick(o.el);
        return w.length > 0 && w.every((o) => o.el.checked);
      },
    };
  }

  // A lone consent/acknowledgement checkbox: the answer's truthiness sets checked/unchecked.
  function consentAdapter(el) {
    return {
      kind: "checkbox",
      el,
      isEmpty() {
        return !el.checked; // unchecked is the default → safe to fill; a checked box is a deliberate state
      },
      isFilledWith(t) {
        return el.checked === truthy(targetText(t));
      },
      snapshot() {
        const prev = el.checked;
        return () => el.checked !== prev && nativeClick(el);
      },
      async write(t) {
        const want = truthy(targetText(t));
        if (el.checked !== want) nativeClick(el);
        return el.checked === want;
      },
    };
  }

  // A custom clickable choice cluster (segmented control / pill group / button radios).
  // options: [{ el, label }]
  function buttonsAdapter(opts) {
    function wanted(vals) {
      return opts.filter((o) => vals.includes(o.label) || vals.some((v) => normEq(v, o.label)));
    }
    return {
      kind: "buttons",
      isEmpty() {
        return !opts.some((o) => isSelectedOption(o.el));
      },
      isFilledWith(t) {
        const w = wanted(targetOptionValues(t));
        return w.length > 0 && w.every((o) => isSelectedOption(o.el));
      },
      snapshot() {
        const prev = opts.filter((o) => isSelectedOption(o.el));
        return () => {
          // Best-effort revert for a click-driven widget: toggle any option whose selected-state now
          // differs from the snapshot — including deselecting one we picked from an empty group.
          // (Segmented controls with no deselect gesture are inherently unrevertable.)
          for (const o of opts) if (prev.includes(o) !== isSelectedOption(o.el)) clickLikeUser(o.el);
        };
      },
      async write(t) {
        const w = wanted(targetOptionValues(t));
        for (const o of w) if (!isSelectedOption(o.el)) clickLikeUser(o.el);
        return w.length > 0 && w.every((o) => isSelectedOption(o.el));
      },
    };
  }

  // A custom dropdown (ARIA combobox / react-select / Greenhouse flyout): open it, then CLICK the
  // option matching the answer — never just type into it (that strands an overlay). Driven generically
  // by the role=listbox/role=option contract; for long lists, type to filter then re-scan.
  function comboboxAdapter(el) {
    function listOptions() {
      const controls = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
      const scope = controls ? el.ownerDocument.getElementById(controls) : null;
      let opts = scope ? Array.from(scope.querySelectorAll("[role=option]")) : [];
      if (!opts.length) opts = Array.from(el.ownerDocument.querySelectorAll("[role=option]"));
      return opts.filter(isShown);
    }
    function matchOption(list, value) {
      const n = norm(value);
      if (!n) return null;
      return (
        list.find((o) => norm(textOf(o)) === n) ||
        list.find((o) => {
          const t = norm(textOf(o));
          return t && (t.includes(n) || n.includes(t));
        }) ||
        null
      );
    }
    function shown() {
      return String(el.value || "");
    }
    return {
      kind: "combobox",
      el,
      isEmpty() {
        return shown() === "";
      },
      isFilledWith(t) {
        const v = targetText(t);
        return v != null && normEq(shown(), v);
      },
      snapshot() {
        const prev = el.value;
        return () => setNativeValue(el, prev);
      },
      async write(t) {
        const v = targetText(t);
        if (v == null) return false;
        focusNoScroll(el);
        clickLikeUser(el); // open the flyout
        // Poll until options render rather than sleeping a fixed time: returns immediately when the
        // listbox is already populated, but tolerates a slow async flyout (React-select, portals).
        let opt = await pollFor(() => matchOption(listOptions(), v));
        if (!opt) {
          setNativeValue(el, v); // list-autocomplete: type to filter, then re-scan
          opt = await pollFor(() => matchOption(listOptions(), v));
        }
        if (opt) {
          clickLikeUser(opt);
          await wait(0);
          return normEq(shown(), v);
        }
        setNativeValue(el, ""); // nothing matched → clear so no junk is left behind
        commitBlur(el); // and close the flyout (most comboboxes dismiss on blur/focusout)
        return false;
      },
    };
  }

  // Build the right adapter for a harvested descriptor. Descriptors carry live element(s) plus
  // pre-computed labels (the harvester owns DOM labelling); adapters own interaction only.
  function createAdapter(d) {
    if (!d || !d.kind) return null;
    switch (d.kind) {
      case "text":
      case "textarea":
        return d.el ? textAdapter(d.el) : null;
      case "contenteditable":
        return d.el ? contentEditableAdapter(d.el) : null;
      case "select":
        return d.el ? selectAdapter(d.el) : null;
      case "combobox":
        return d.el ? comboboxAdapter(d.el) : null;
      case "radio":
        return d.options && d.options.length ? radioAdapter(d.options) : null;
      case "checkbox":
        return d.options && d.options.length
          ? checkboxGroupAdapter(d.options)
          : d.el
            ? consentAdapter(d.el)
            : null;
      case "buttons":
        return d.options && d.options.length ? buttonsAdapter(d.options) : null;
      default:
        return null;
    }
  }

  // ===========================================================================
  // FilledRegistry — remembers what we wrote per stable field key across re-scans, so a repeat pass
  // (a) doesn't redo work, and (b) can tell OUR prior value (safe to update) from content the user
  // typed (must not clobber).
  // ===========================================================================
  class FilledRegistry {
    constructor() {
      this.map = new Map();
    }
    record(key, value) {
      this.map.set(key, value);
    }
    get(key) {
      return this.map.has(key) ? this.map.get(key) : null;
    }
    has(key) {
      return this.map.has(key);
    }
    clear() {
      this.map.clear();
    }
    get size() {
      return this.map.size;
    }
  }

  // ===========================================================================
  // fillField — the policy orchestrator. Pure decision logic over an adapter; adapters own mechanism.
  // Returns { status, changed, undo? } where status is one of:
  //   already        — already holds the target (no write, no events — the no-waste path)
  //   filled         — written and verified
  //   skipped-user   — non-empty content we didn't write; left untouched
  //   failed         — written but read-back still wrong (reported, not a false success)
  //   empty-target   — nothing to write
  // ===========================================================================
  async function fillField(adapter, target, ctx) {
    ctx = ctx || {};
    const registry = ctx.registry;
    const key = ctx.key;
    const hasKey = registry && key != null;

    if (!adapter || !isActionable(target)) return { status: "empty-target", changed: false };

    if (adapter.isFilledWith(target)) {
      if (hasKey) registry.record(key, target);
      return { status: "already", changed: false };
    }

    // Non-empty and not ours → protect the user's content.
    if (!adapter.isEmpty()) {
      const last = hasKey ? registry.get(key) : null;
      if (last == null || !adapter.isFilledWith(last)) {
        return { status: "skipped-user", changed: false };
      }
    }

    const undo = adapter.snapshot();
    try {
      await adapter.write(target);
    } catch (_) {
      /* verified below regardless */
    }
    const verified = adapter.isFilledWith(target);
    if (verified && hasKey) registry.record(key, target);
    return { status: verified ? "filled" : "failed", changed: true, undo };
  }

  return {
    // primitives
    setNativeValue,
    clickLikeUser,
    nativeClick,
    coerceValue,
    norm,
    normEq,
    truthy,
    isShown,
    // adapters + policy
    createAdapter,
    fillField,
    FilledRegistry,
  };
});
