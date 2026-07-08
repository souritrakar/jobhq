// Live application-form sync — the deterministic, automatic replacement for manual question
// picking. While the save panel is open, this module keeps a two-way mirror between the host
// page's application form and the panel's Application tab:
//
//   • DETECT   — harvestQuestions() (generic label/kind/option harvest, zero LLM) runs on
//                activate and again on every settled DOM mutation, so multi-page / multi-step
//                forms flow into the panel with no user action. Questions are keyed by CONTENT
//                identity (questionMapper.keyOf), so framework re-renders and step transitions
//                re-associate instead of duplicating.
//   • MIRROR   — document-level input/change/click listeners read the changed control through
//                the fill engine's adapter.read() and push the value to the panel. Panel edits
//                write back through the same tested adapters (native setter + real events).
//                Value-equality checks make the loop self-quenching in both directions.
//   • REMEMBER — questions that leave the DOM (a completed step) stay in the model with their
//                captured answers, marked off-page. Nothing is ever written to the backend
//                here; the caller persists locally and pushes on save.
//
// The host page's DOM is only ever mutated by explicit panel edits (user-driven), through
// lib/field-adapters.js. No site-specific selectors anywhere. Isolated-world global:
// JobTracker.ui.formSync; UMD-exported for unit tests (jsdom).
(function (root, factory) {
  "use strict";
  const NS = (root.JobTracker = root.JobTracker || {});
  NS.ui = NS.ui || {};
  const api = factory(root);
  NS.ui.formSync = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  const REHARVEST_MS = 400; // settle window after a DOM mutation (matches the picker's cadence)
  const CLICK_READ_MS = 60; // let the page's framework apply click-driven state before reading
  const TEXT_WRITE_MS = 250; // per-field debounce for panel→page text writes
  const MAX_ENTRIES = 200; // matches the harvest / backend caps
  const CLIMB = 12; // how far to walk up from an event target looking for a tracked control

  // Kinds whose panel edits are debounced (every keystroke) vs written immediately (choices).
  const TEXTUAL = new Set(["text", "textarea", "contenteditable", "combobox"]);

  // Our own overlay hosts — events retargeted/composed out of these are never page edits.
  const OWN_HOSTS = new Set([
    "jobtracker-modal-host",
    "jobtracker-picker-host",
    "jobtracker-save-host",
  ]);

  function textOf(node) {
    return ((node && node.textContent) || "").replace(/\s+/g, " ").trim();
  }
  function valueEq(a, b) {
    const arrA = Array.isArray(a);
    const arrB = Array.isArray(b);
    if (arrA || arrB) {
      const A = arrA ? a : a ? [a] : [];
      const B = arrB ? b : b ? [b] : [];
      return A.length === B.length && A.every((v, i) => String(v) === String(B[i]));
    }
    return String(a == null ? "" : a) === String(b == null ? "" : b);
  }
  function emptyAnswer(v) {
    return Array.isArray(v) ? v.length === 0 : v == null || String(v).trim() === "";
  }

  function deps() {
    const NS = root.JobTracker || {};
    const ui = NS.ui || {};
    return { autofill: ui.autofill, fill: ui.fill, mapper: NS.questionMapper, scope: NS.scope };
  }

  // ---- module state --------------------------------------------------------------------------
  let active = false;
  let hooks = {};
  let entries = new Map(); // key → { key, question, answer, onPage, pinned, seq, descriptor, anchors, baseline }
  let order = []; // keys in stable first-seen order (never reshuffled once a question appears)
  let seqCounter = 0; // monotonic first-seen sequence — the sole basis for presentation order
  let ignored = new Set(); // dismissed keys — never resurrected by a re-harvest
  let elIndex = new WeakMap(); // control element → key (rebuilt per harvest)
  let mo = null;
  let moTimer = null;
  let readTimers = new Map(); // key → timeout id (coalesced page reads)
  let writeTimers = new Map(); // key → timeout id (debounced panel→page text writes)
  let lastShape = ""; // structure signature — onModel fires only on real structural change
  let dirty = new Set(); // keys whose value CHANGED this session — an explicit clear ("")
  //                        is only meaningful (and only pushed on save) for these

  // ---- reading -------------------------------------------------------------------------------
  // Current page value of an entry, in answer shape (string | string[]). Falls back to the
  // stored answer when the control is gone. Combobox: react-select-style widgets keep their
  // chosen value as TEXT in the widget box, not in the input — so when the input reads empty,
  // compare the box text against the placeholder text captured at harvest ("baseline"); any
  // difference IS the selection. Generic — no site CSS.
  function readEntry(entry) {
    const { fill } = deps();
    const d = entry.descriptor;
    if (!d || !fill) return entry.answer;
    try {
      if (d.kind === "file") {
        const f = d.el && d.el.files && d.el.files[0];
        return f ? f.name : "";
      }
      const adapter = fill.createAdapter(d);
      if (!adapter || typeof adapter.read !== "function") return entry.answer;
      let v = adapter.read();
      if (d.kind === "combobox" && (v == null || v === "")) {
        const box = entry.anchors && entry.anchors[0];
        const t = box && box.isConnected ? textOf(box) : "";
        v = t && entry.baseline != null && t !== entry.baseline ? t : "";
      }
      return v == null ? "" : v;
    } catch (_) {
      return entry.answer; // hostile page mid-teardown — keep what we have
    }
  }

  // ---- writing (panel → page) ------------------------------------------------------------------
  // Mirror semantics, not autofill semantics: the user edited the panel, so the page control is
  // set to EXACTLY that value — including deselecting options and clearing text. Multi-value
  // groups therefore bypass adapter.write (which only adds selections) for an exact diff.
  async function writeEntry(entry, value) {
    const { fill } = deps();
    const d = entry.descriptor;
    if (!d || !fill || d.kind === "file") return;
    try {
      if (d.kind === "checkbox" && d.options && d.options.length) {
        const want = new Set((Array.isArray(value) ? value : value ? [value] : []).map(fill.norm));
        for (const o of d.options) {
          const on = want.has(fill.norm(o.label)) || want.has(fill.norm(o.value));
          if (!!o.el.checked !== on) fill.nativeClick(o.el);
        }
        return;
      }
      if (d.kind === "select" && d.el && d.el.multiple) {
        const want = new Set((Array.isArray(value) ? value : value ? [value] : []).map(fill.norm));
        let changed = false;
        for (const o of Array.from(d.el.options || [])) {
          const on = want.has(fill.norm(textOf(o))) || want.has(fill.norm(o.value));
          if (o.value !== "" && o.selected !== on) {
            o.selected = on;
            changed = true;
          }
        }
        if (changed) d.el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      const adapter = fill.createAdapter(d);
      if (!adapter) return;
      const target = Array.isArray(value)
        ? { value: value.join(", "), optionValues: value }
        : { value: String(value == null ? "" : value), optionValues: value ? [String(value)] : [] };
      await adapter.write(target);
    } catch (_) {
      // Best effort: the next page event re-syncs the panel to whatever the page really holds.
    }
  }

  // ---- model plumbing --------------------------------------------------------------------------
  // A field the user answered ON THIS PAGE whose control then vanished (a file input replaced by a
  // "filename + remove" chip after upload) is `pinned`: it reads as on-page so it isn't dimmed,
  // tagged "Other step", or reshuffled. Genuine earlier-step questions (never pinned) still tag.
  function effectiveOnPage(e) {
    return e.onPage || !!e.pinned;
  }
  function model() {
    return order
      .map((key) => entries.get(key))
      .filter(Boolean)
      .map((e) => ({ key: e.key, question: e.question, answer: e.answer, onPage: effectiveOnPage(e) }));
  }
  function shapeOf() {
    return order
      .map((key) => {
        const e = entries.get(key);
        return e ? key + "|" + (effectiveOnPage(e) ? 1 : 0) : "";
      })
      .join("\n");
  }
  function emitModelIfChanged(force) {
    const shape = shapeOf();
    if (!force && shape === lastShape) return;
    lastShape = shape;
    if (typeof hooks.onModel === "function") {
      try {
        hooks.onModel(model());
      } catch (_) {}
    }
  }
  function setAnswerInternal(entry, value, fromPage) {
    if (valueEq(entry.answer, value)) return;
    entry.answer = value;
    dirty.add(entry.key);
    // A chosen file pins its field in place (its input often disappears after upload).
    if (!emptyAnswer(value) && entry.question && entry.question.type === "file") entry.pinned = true;
    if (typeof hooks.onAnswer === "function") {
      try {
        hooks.onAnswer(entry.key, value, fromPage);
      } catch (_) {}
    }
  }

  // ---- harvest → model -------------------------------------------------------------------------
  function refresh() {
    if (!active) return;
    const { autofill, mapper } = deps();
    if (!autofill || !mapper || typeof autofill.harvestQuestions !== "function") return;
    let h;
    try {
      h = autofill.harvestQuestions();
    } catch (_) {
      return; // try again on the next mutation tick
    }
    elIndex = new WeakMap();
    const seen = new Set();

    for (const field of h.fields || []) {
      const question = mapper.toQuestion(field);
      if (!question) continue; // unlabeled, or consent-noise checkbox
      const key = mapper.keyOf(question);
      if (ignored.has(key) || seen.has(key)) continue;
      seen.add(key);

      let entry = entries.get(key);
      if (!entry) {
        if (entries.size >= MAX_ENTRIES) continue;
        entry = { key, question, answer: "", onPage: false, pinned: false, seq: seqCounter++,
          descriptor: null, anchors: null, baseline: null };
        entries.set(key, entry);
      } else if (entry.question) {
        // The panel holds — and mutates `flagged` on — the entry's question OBJECT. Keep that
        // object across re-harvests (its identity fields can't have changed; they ARE the key)
        // and refresh only the non-identity metadata on it.
        const kept = entry.question;
        if (question.required) kept.required = true;
        else delete kept.required;
        if (question.placeholder) kept.placeholder = question.placeholder;
        else delete kept.placeholder;
      } else {
        entry.question = question;
      }
      entry.descriptor = (h.descriptors && h.descriptors.get(field.id)) || null;
      entry.anchors = (h.anchors && h.anchors.get(field.id)) || null;
      entry.onPage = !!entry.descriptor;

      // Index the live control elements for O(1) event → entry resolution.
      const d = entry.descriptor;
      if (d) {
        if (d.el) elIndex.set(d.el, key);
        if (d.options) for (const o of d.options) if (o.el) elIndex.set(o.el, key);
      }
      if (entry.anchors) for (const a of entry.anchors) if (a && a.nodeType === 1) elIndex.set(a, key);

      // First sight of a combobox with nothing typed: the widget box text is its placeholder.
      if (d && d.kind === "combobox" && entry.baseline == null) {
        const box = entry.anchors && entry.anchors[0];
        entry.baseline = box ? textOf(box) : "";
      }

      // Page value wins when it has content; an empty control never clobbers a stored answer
      // (protects step transitions that remount fields blank — live clears still arrive via events).
      const v = readEntry(entry);
      if (!emptyAnswer(v)) setAnswerInternal(entry, v, true);
    }

    // Anything tracked but absent from this pass lives on another step/page now.
    for (const entry of entries.values()) {
      if (!seen.has(entry.key)) {
        entry.onPage = false;
        entry.descriptor = null;
        entry.anchors = null;
      }
    }

    // Presentation order: stable first-seen. Every question keeps the slot it first appeared in —
    // restored (seeded first) lead, then each newly-detected question in the order it was found, and
    // NOTHING is reshuffled when a field goes off-page or its control briefly vanishes (a file input
    // hidden after upload no longer leaps to the top). Earlier multi-step questions still come first
    // for free, because they were seen first.
    order = Array.from(entries.keys()).sort((a, b) => entries.get(a).seq - entries.get(b).seq);
    emitModelIfChanged(false);
  }

  // ---- page events → panel -----------------------------------------------------------------------
  function fromOwnUi(e) {
    const path = typeof e.composedPath === "function" ? e.composedPath() : null;
    if (path) {
      for (const n of path) if (n && n.id && OWN_HOSTS.has(n.id)) return true;
      return false;
    }
    const t = e.target;
    return !!(t && t.id && OWN_HOSTS.has(t.id));
  }

  function resolveKey(target) {
    let node = target;
    for (let up = 0; up < CLIMB && node; up++) {
      const key = elIndex.get(node);
      if (key != null) return key;
      node = node.parentElement;
    }
    // Containment fallback for custom widgets whose inner nodes we never indexed
    // (react-select menus render arbitrary descendants inside the widget box).
    for (const entry of entries.values()) {
      if (!entry.onPage || !entry.anchors) continue;
      for (const a of entry.anchors) {
        if (a && a.contains && a.contains(target)) return entry.key;
      }
    }
    return null;
  }

  function scheduleRead(key, delay) {
    const prev = readTimers.get(key);
    if (prev) clearTimeout(prev);
    readTimers.set(
      key,
      setTimeout(() => {
        readTimers.delete(key);
        if (!active) return;
        const entry = entries.get(key);
        if (!entry || !entry.onPage) return;
        setAnswerInternal(entry, readEntry(entry), true);
      }, delay),
    );
  }

  function onPageEvent(e) {
    if (!active || fromOwnUi(e)) return;
    const target = e.target;
    if (!target || target.nodeType !== 1) return;
    const key = resolveKey(target);
    if (key == null) return;
    // Typing reads on a micro-delay (coalesces bursts); clicks/changes wait a beat so the
    // page's framework applies the new state (custom widgets update async) before we read.
    scheduleRead(key, e.type === "input" ? 0 : CLICK_READ_MS);
  }

  function startObservers() {
    document.addEventListener("input", onPageEvent, { capture: true, passive: true });
    document.addEventListener("change", onPageEvent, { capture: true, passive: true });
    document.addEventListener("click", onPageEvent, { capture: true, passive: true });
    try {
      // THROTTLE, not debounce: a page that animates styles continuously would push a trailing
      // debounce forever and the re-harvest would never run. This fires at most once per window.
      mo = new MutationObserver(() => {
        if (moTimer) return;
        moTimer = setTimeout(() => {
          moTimer = null;
          if (active) refresh();
        }, REHARVEST_MS);
      });
      mo.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-pressed", "aria-checked", "aria-selected", "hidden", "style"],
      });
    } catch (_) {}
  }

  function stopObservers() {
    document.removeEventListener("input", onPageEvent, { capture: true });
    document.removeEventListener("change", onPageEvent, { capture: true });
    document.removeEventListener("click", onPageEvent, { capture: true });
    if (mo) mo.disconnect();
    mo = null;
    clearTimeout(moTimer);
    moTimer = null;
    for (const t of readTimers.values()) clearTimeout(t);
    for (const t of writeTimers.values()) clearTimeout(t);
    readTimers = new Map();
    writeTimers = new Map();
  }

  // ---- public API ---------------------------------------------------------------------------------
  // activate({ questions, answers, ignoredKeys, onModel, onAnswer })
  //   questions   — previously captured ApplicationQuestion[] (restored off-page until found)
  //   answers     — { key → string | string[] } draft answers to seed
  //   ignoredKeys — keys the user dismissed (never re-added)
  //   onModel(m)  — structure changed: m = [{ key, question, answer, onPage }] in order
  //   onAnswer(key, value, fromPage) — a single value changed (page edit OR panel edit echo)
  async function activate(opts) {
    opts = opts || {};
    hooks = { onModel: opts.onModel, onAnswer: opts.onAnswer };
    if (!active) {
      entries = new Map();
      order = [];
      seqCounter = 0;
      lastShape = "";
      dirty = new Set();
      ignored = new Set(opts.ignoredKeys || []);
      const { mapper } = deps();
      const answers = opts.answers || {};
      // Restored questions are seeded first, so they take the lowest seq and lead the panel.
      for (const q of opts.questions || []) {
        if (!q || !q.label || !mapper) continue;
        const key = mapper.keyOf(q);
        if (ignored.has(key) || entries.has(key)) continue;
        entries.set(key, {
          key,
          question: q,
          answer: key in answers ? answers[key] : "",
          onPage: false,
          pinned: false,
          seq: seqCounter++,
          descriptor: null,
          anchors: null,
          baseline: null,
        });
        order.push(key);
      }
      active = true;
      const { scope } = deps();
      if (scope && typeof scope.settle === "function") await scope.settle();
      if (!active) return; // deactivated while settling
      startObservers();
    }
    refresh();
    emitModelIfChanged(true); // initial paint even when the page adds nothing yet
  }

  function deactivate() {
    if (!active) return;
    active = false;
    stopObservers();
    entries = new Map();
    order = [];
    seqCounter = 0;
    ignored = new Set();
    dirty = new Set();
    elIndex = new WeakMap();
    lastShape = "";
    hooks = {};
  }

  /** Panel edit: update the model and mirror the value onto the live page control. */
  function setAnswer(key, value) {
    const entry = entries.get(key);
    if (!entry) return;
    setAnswerInternal(entry, value, false);
    if (!entry.onPage || !entry.descriptor) return; // off-page → local only
    const textual = TEXTUAL.has(entry.descriptor.kind);
    const prev = writeTimers.get(key);
    if (prev) clearTimeout(prev);
    if (!textual) {
      writeEntry(entry, value);
      return;
    }
    writeTimers.set(
      key,
      setTimeout(() => {
        writeTimers.delete(key);
        if (active) writeEntry(entry, entry.answer);
      }, TEXT_WRITE_MS),
    );
  }

  /** Dismiss a mis-detected field: drop it and never re-add it for this posting. */
  function dismiss(key) {
    if (!entries.has(key)) return;
    entries.delete(key);
    order = order.filter((k) => k !== key);
    ignored.add(key);
    emitModelIfChanged(true);
  }

  /** Tracked questions in presentation order (the save payload / local record shape). */
  function getQuestions() {
    return order.map((k) => entries.get(k)).filter(Boolean).map((e) => e.question);
  }
  /** Draft answers as { key → value }. Untouched empties are omitted; an answer the user
   *  explicitly cleared THIS session is kept as "" so the clear reaches the server on save
   *  (a blank page must never silently wipe answers saved from the web app). */
  function getAnswers() {
    const out = {};
    for (const e of entries.values()) {
      if (!emptyAnswer(e.answer)) out[e.key] = e.answer;
      else if (dirty.has(e.key)) out[e.key] = "";
    }
    return out;
  }
  function getIgnoredKeys() {
    return Array.from(ignored);
  }
  function isActive() {
    return active;
  }

  return {
    activate,
    deactivate,
    setAnswer,
    dismiss,
    getQuestions,
    getAnswers,
    getIgnoredKeys,
    isActive,
    // exposed for tests
    _internals: { valueEq, emptyAnswer },
  };
});
