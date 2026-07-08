// On-page field picker — the deterministic, user-driven replacement for LLM question
// extraction. One overlay LAYER (shadow-rooted host on <html>, pointer-events:none, badges
// re-enable; z-index BELOW the panel and FAB) holds one badge per logical question harvested
// from the page. The host page's DOM is never mutated — framework re-renders can't duplicate
// or delete our badges, site CSS can't leak in, and teardown is removing one node.
//
// Identity: badges are keyed by the QUESTION's content identity (questionMapper.keyOf —
// label+type+options), not by DOM attributes. A re-rendered control re-associates with its
// badge and keeps its selected state; stored questions restore their marks the same way.
(function (root, factory) {
  "use strict";
  const NS = (root.JobTracker = root.JobTracker || {});
  NS.ui = NS.ui || {};
  const api = factory(root);
  NS.ui.picker = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  const LAYER_ID = "jobtracker-picker-host";
  const PANEL_HOST_ID = "jobtracker-modal-host";
  const ADD_DELAY_MS = 500; // deliberate perceived-effort delay before the success state
  const REMOVE_DELAY_MS = 220; // brief working state on deselect — feedback without friction
  const BADGE = 28; // px — the badge's height & collapsed (icon-only) diameter
  const PAD = 8; // px inset from the field's INNER top-right corner (simplify.jobs style)
  const REHARVEST_MS = 400;

  // Scope: only free-text/paragraph answers are worth saving to reuse later (essays, "why us",
  // cover-letter-style prompts) — short text, selects, dates and files are trivial or profile
  // data that autofill already covers. `long_text` is the mapper's type for <textarea> AND
  // contenteditable, i.e. every multi-line free-text box.
  const PICKABLE_TYPES = new Set(["long_text"]);

  const CSS = `
    :host { all: initial; }
    .jtp-layer { position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }

    /* Badge — a pill tucked INSIDE the field's top-right corner (simplify.jobs style). Idle it's
       a quiet icon-only circle; on hover/focus it expands leftward to reveal its "Save" label. */
    .jtp-badge { position: absolute; height: ${BADGE}px; min-width: ${BADGE}px; box-sizing: border-box;
      border-radius: 999px; pointer-events: auto; cursor: pointer; padding: 0; overflow: hidden;
      display: inline-flex; align-items: center; justify-content: flex-start;
      background: #ffffff; border: 1.5px solid #266645; color: #266645; opacity: 0.6;
      box-shadow: 0 1px 3px rgba(18, 45, 32, 0.16);
      transition: opacity .16s ease, box-shadow .16s ease, background .16s ease, color .16s ease,
        padding .2s ease, border-color .16s ease; }
    .jtp-badge .jtp-ico { flex: 0 0 auto; width: ${BADGE - 2}px; height: ${BADGE}px;
      display: inline-flex; align-items: center; justify-content: center; }
    .jtp-badge .jtp-ico svg { width: 15px; height: 15px; display: block; }
    .jtp-badge .jtp-label { max-width: 0; opacity: 0; overflow: hidden; white-space: nowrap;
      font-size: 12.5px; font-weight: 600; letter-spacing: .01em;
      transition: max-width .22s ease, opacity .16s ease; }
    .jtp-badge.near, .jtp-badge:hover, .jtp-badge:focus-visible { opacity: 1; padding-right: 12px;
      box-shadow: 0 4px 12px rgba(18, 45, 32, 0.22); }
    .jtp-badge.near .jtp-label, .jtp-badge:hover .jtp-label, .jtp-badge:focus-visible .jtp-label {
      max-width: 130px; opacity: 1; }
    .jtp-badge.working { cursor: default; opacity: 1; }
    .jtp-badge.working .jtp-ico svg { animation: jtp-spin .7s linear infinite; }
    .jtp-badge.selected { opacity: 1; background: #266645; border-color: #1e5a3c; color: #ffffff;
      box-shadow: 0 2px 8px rgba(30, 90, 60, 0.32);
      animation: jtp-pop .28s cubic-bezier(.32,1.6,.4,1); }
    .jtp-badge.unpicked { animation: jtp-shrink .24s ease; }
    .jtp-badge.hidden { opacity: 0; pointer-events: none; }

    /* Mode chip — carries discoverability so the idle badges can stay quiet. */
    .jtp-chip { position: fixed; left: 16px; bottom: 16px; z-index: 1; pointer-events: none;
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
      background: #122d20; color: #f0f8f3; font-size: 12.5px; font-weight: 500; line-height: 1;
      box-shadow: 0 4px 16px rgba(18, 45, 32, 0.28); max-width: min(340px, 90vw);
      transition: opacity .2s ease; }
    .jtp-chip .jtp-chip-dot { width: 16px; height: 16px; border-radius: 50%; flex: 0 0 auto;
      background: #ffffff; border: 1.5px solid #266645; color: #266645;
      display: inline-flex; align-items: center; justify-content: center; }
    .jtp-chip .jtp-chip-dot svg { width: 10px; height: 10px; display: block; }
    .jtp-chip .jtp-chip-count { font-weight: 600; color: #9ecfb4; white-space: nowrap; }

    @keyframes jtp-spin { to { transform: rotate(360deg); } }
    @keyframes jtp-pop { 0% { transform: scale(.7); } 60% { transform: scale(1.14); } 100% { transform: scale(1); } }
    @keyframes jtp-shrink { 0% { transform: scale(1.1); } 100% { transform: scale(1); } }
  `;

  const SVGNS = "http://www.w3.org/2000/svg";
  const GLYPH = {
    plus: "M12 5v14M5 12h14",
    check: "M20 6L9 17l-5-5",
    spinner: "M21 12a9 9 0 1 1-6.2-8.56",
    bookmark: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z", // "save for later"
  };

  function glyph(name) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.4");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", GLYPH[name]);
    svg.append(p);
    return svg;
  }

  // ---- module state ------------------------------------------------------------------------
  let active = false;
  let host = null;
  let layer = null;
  let chip = null; // mode chip element
  let chipCount = null; // the "N tracked" span inside the chip
  let registry = new Map(); // key → { key, badge, tip, anchors, question, order, state }
  let selected = new Set(); // keys
  let hooks = {};
  let mo = null;
  let moTimer = null;
  let rafPending = false;
  let pageOrder = []; // keys in harvest (page) order, refreshed per harvest
  let hoverKey = null; // key of the field the pointer is currently over (bloom target)
  let pointerX = -1;
  let pointerY = -1;
  let hoverPending = false;

  function deps() {
    const NS = root.JobTracker || {};
    const ui = NS.ui || {};
    return { autofill: ui.autofill, mapper: NS.questionMapper, scope: NS.scope };
  }

  function ensureLayer() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.id = LAYER_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    layer = document.createElement("div");
    layer.className = "jtp-layer";
    layer.append(buildChip());
    shadow.append(style, layer);
    document.documentElement.append(host);
  }

  // The mode chip: a persistent "here's what this mode does + how many you've picked" cue, so
  // the per-field badges can stay recessive without hurting discoverability.
  function buildChip() {
    chip = document.createElement("div");
    chip.className = "jtp-chip";
    const dot = document.createElement("span");
    dot.className = "jtp-chip-dot";
    dot.append(glyph("bookmark"));
    const label = document.createElement("span");
    label.textContent = "Save the long-answer questions you'll want to reuse";
    chipCount = document.createElement("span");
    chipCount.className = "jtp-chip-count";
    chip.append(dot, label, chipCount);
    updateChip();
    return chip;
  }

  function updateChip() {
    if (!chipCount) return;
    const n = selected.size;
    chipCount.textContent = n ? `· ${n} saved` : "";
  }

  // ---- badge state machine -----------------------------------------------------------------
  function setBadgeState(entry, state) {
    entry.state = state;
    const b = entry.badge;
    b.classList.toggle("working", state === "working");
    b.classList.toggle("selected", state === "selected");
    entry.ico.replaceChildren(
      glyph(state === "working" ? "spinner" : state === "selected" ? "check" : "bookmark"),
    );
    entry.label.textContent = state === "selected" ? "Saved" : state === "working" ? "Saving…" : "Save";
    b.setAttribute("aria-pressed", state === "selected" ? "true" : "false");
    b.setAttribute(
      "aria-label",
      state === "selected" ? "Saved — click to remove" : "Save this question to reuse later",
    );
  }

  function onBadgeClick(entry) {
    if (!active || entry.state === "working") return;
    const wasSelected = entry.state === "selected";
    setBadgeState(entry, "working");
    // The deliberate delay: a lightweight operation reads as meaningful work.
    setTimeout(() => {
      if (!active || !registry.has(entry.key)) return;
      if (wasSelected) {
        selected.delete(entry.key);
        setBadgeState(entry, "idle");
        entry.badge.classList.add("unpicked"); // shrink-settle deselect feedback
        setTimeout(() => entry.badge.classList.remove("unpicked"), 260);
        if (typeof hooks.onUnpick === "function") hooks.onUnpick(entry.key);
      } else {
        selected.add(entry.key);
        setBadgeState(entry, "selected");
        if (typeof hooks.onPick === "function") hooks.onPick(entry.question, entry.key);
      }
      updateChip();
    }, wasSelected ? REMOVE_DELAY_MS : ADD_DELAY_MS);
  }

  function makeEntry(key, question) {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "jtp-badge";
    const ico = document.createElement("span");
    ico.className = "jtp-ico";
    const label = document.createElement("span");
    label.className = "jtp-label";
    badge.append(ico, label);
    const entry = { key, question, badge, ico, label, anchors: [], order: 0, state: "idle" };
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onBadgeClick(entry);
    });
    layer.append(badge);
    setBadgeState(entry, "idle");
    return entry;
  }

  // ---- harvest → registry --------------------------------------------------------------------
  function refresh() {
    if (!active) return;
    const { autofill, mapper } = deps();
    if (!autofill || !mapper || typeof autofill.harvestQuestions !== "function") return;
    let h;
    try {
      h = autofill.harvestQuestions();
    } catch (_) {
      return; // a hostile page mid-teardown — try again on the next mutation tick
    }
    ensureLayer();
    const seen = new Set();
    pageOrder = [];
    for (const field of h.fields || []) {
      const question = mapper.toQuestion(field);
      if (!question) continue; // unlabeled or consent-noise checkbox
      if (!PICKABLE_TYPES.has(question.type)) continue; // only long-text answers are pickable
      const key = mapper.keyOf(question);
      if (seen.has(key)) continue; // one badge per question identity — duplicates impossible
      const anchors = (h.anchors && h.anchors.get(field.id)) || [];
      if (!anchors.length) continue;
      seen.add(key);
      pageOrder.push(key);
      let entry = registry.get(key);
      if (!entry) {
        entry = makeEntry(key, question);
        registry.set(key, entry);
      }
      entry.question = question;
      entry.anchors = anchors;
      entry.order = pageOrder.length - 1;
      if (entry.state !== "working") {
        setBadgeState(entry, selected.has(key) ? "selected" : "idle");
      }
    }
    for (const [key, entry] of registry) {
      if (!seen.has(key)) {
        entry.badge.remove();
        registry.delete(key);
      }
    }
    updateChip();
    positionAll();
  }

  // ---- positioning ---------------------------------------------------------------------------
  function unionRect(anchorEls) {
    let r = null;
    for (const el of anchorEls) {
      if (!el || !el.isConnected) continue;
      if (el.getClientRects && el.getClientRects().length === 0) continue; // not rendered
      const b = el.getBoundingClientRect();
      if (!b || (b.width === 0 && b.height === 0)) continue;
      r = r
        ? {
            top: Math.min(r.top, b.top),
            left: Math.min(r.left, b.left),
            right: Math.max(r.right, b.right),
            bottom: Math.max(r.bottom, b.bottom),
          }
        : { top: b.top, left: b.left, right: b.right, bottom: b.bottom };
    }
    return r;
  }

  // The save panel owns the viewport's right strip while open — hide badges under it.
  function panelLeftEdge() {
    const panelHost = document.getElementById(PANEL_HOST_ID);
    if (!panelHost) return Infinity;
    try {
      const panel = panelHost.shadowRoot && panelHost.shadowRoot.querySelector(".panel");
      if (panel) {
        const r = panel.getBoundingClientRect();
        if (r.width > 0) return r.left;
      }
    } catch (_) {}
    const iw = root.innerWidth || document.documentElement.clientWidth || 0;
    return iw - Math.min(384, iw * 0.94); // panel CSS: width:min(384px,94vw), pinned right
  }

  function positionAll() {
    const iw = root.innerWidth || document.documentElement.clientWidth || 0;
    const ih = root.innerHeight || document.documentElement.clientHeight || 0;
    const panelLeft = panelLeftEdge();
    for (const entry of registry.values()) {
      const r = unionRect(entry.anchors);
      const b = entry.badge;
      // Off-screen (scrolled away) OR the field's right edge is under the open save panel → hide.
      if (!r || r.bottom < 0 || r.top > ih || r.right - PAD > panelLeft) {
        b.classList.add("hidden");
        continue;
      }
      // Tuck INSIDE the field's top-right corner, RIGHT-anchored so the pill grows leftward as it
      // expands on hover (never spilling past the field's right edge or off-screen). Textareas —
      // the only fields we badge — have empty space there, so it never covers the answer text.
      const rightInset = iw - (r.right - PAD);
      const top = r.top + PAD;
      b.classList.remove("hidden");
      b.style.left = "auto";
      b.style.right = Math.max(2, Math.min(rightInset, iw - BADGE - 2)) + "px";
      b.style.top = Math.max(2, Math.min(top, ih - BADGE - 2)) + "px";
    }
  }

  function schedulePosition() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (active) positionAll();
    });
  }

  // Bloom on intent: as the pointer moves over a field, its badge goes full-strength, so N idle
  // badges stay recessive while the one you're aiming at lights up. The layer is
  // pointer-events:none, so the page still gets every event — we just read the coordinates.
  function onPointerMove(e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (hoverPending) return;
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      if (active) updateHover();
    });
  }

  function updateHover() {
    let hit = null;
    for (const entry of registry.values()) {
      const r = unionRect(entry.anchors);
      if (!r) continue;
      if (pointerX >= r.left && pointerX <= r.right && pointerY >= r.top && pointerY <= r.bottom) {
        hit = entry.key;
        break;
      }
    }
    if (hit === hoverKey) return;
    hoverKey = hit;
    for (const entry of registry.values()) {
      entry.badge.classList.toggle("near", entry.key === hoverKey);
    }
  }

  function onMutations() {
    clearTimeout(moTimer);
    moTimer = setTimeout(() => {
      if (active) refresh();
    }, REHARVEST_MS);
  }

  function startObservers() {
    root.addEventListener("scroll", schedulePosition, { capture: true, passive: true });
    root.addEventListener("resize", schedulePosition, { passive: true });
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    try {
      mo = new MutationObserver(onMutations);
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  function stopObservers() {
    root.removeEventListener("scroll", schedulePosition, { capture: true });
    root.removeEventListener("resize", schedulePosition);
    root.removeEventListener("pointermove", onPointerMove);
    if (mo) mo.disconnect();
    mo = null;
    clearTimeout(moTimer);
    moTimer = null;
  }

  // ---- public API ------------------------------------------------------------------------------
  async function activate(opts) {
    opts = opts || {};
    hooks = { onPick: opts.onPick, onUnpick: opts.onUnpick };
    if (active) {
      // Idempotent re-activation: refresh, honoring new keys only when provided.
      if (opts.selectedKeys) selected = new Set(opts.selectedKeys);
      refresh();
      return;
    }
    // Fresh activation always starts from the caller's keys — never a previous session's.
    selected = new Set(opts.selectedKeys || []);
    active = true;
    const { scope } = deps();
    if (scope && typeof scope.settle === "function") await scope.settle();
    if (!active) return; // deactivated while settling
    ensureLayer();
    refresh();
    startObservers();
  }

  function deactivate() {
    if (!active && !host) return;
    active = false;
    stopObservers();
    if (host) host.remove();
    host = null;
    layer = null;
    chip = null;
    chipCount = null;
    registry = new Map();
    pageOrder = [];
    hoverKey = null;
    pointerX = -1;
    pointerY = -1;
  }

  function setSelectedKeys(keys) {
    selected = new Set(keys || []);
    for (const [key, entry] of registry) {
      if (entry.state === "working") continue;
      setBadgeState(entry, selected.has(key) ? "selected" : "idle");
    }
    updateChip();
  }

  /** Currently-selected questions in page order. */
  function getSelected() {
    const out = [];
    for (const key of pageOrder) {
      if (!selected.has(key)) continue;
      const entry = registry.get(key);
      if (entry) out.push(entry.question);
    }
    return out;
  }

  function isActive() {
    return active;
  }

  return { activate, deactivate, setSelectedKeys, getSelected, isActive, ADD_DELAY_MS };
});
