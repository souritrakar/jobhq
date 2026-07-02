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
  const BADGE = 26; // px diameter
  const GAP = 8; // px between control edge and an outside badge
  const REHARVEST_MS = 400;

  const CSS = `
    :host { all: initial; }
    .jtp-layer { position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
    .jtp-badge { position: absolute; width: ${BADGE}px; height: ${BADGE}px; border-radius: 50%;
      box-sizing: border-box; pointer-events: auto; cursor: pointer; padding: 0;
      display: flex; align-items: center; justify-content: center;
      background: #ffffff; border: 1.5px solid #3f9b6a; color: #3f9b6a;
      box-shadow: 0 1px 4px rgba(26, 43, 34, 0.18);
      transition: transform .16s ease, background .16s ease, color .16s ease, opacity .16s ease; }
    .jtp-badge:hover { transform: scale(1.08); box-shadow: 0 2px 8px rgba(26, 43, 34, 0.24); }
    .jtp-badge svg { width: 14px; height: 14px; display: block; }
    .jtp-badge.working { cursor: default; }
    .jtp-badge.working svg { animation: jtp-spin .7s linear infinite; }
    .jtp-badge.selected { background: #3f9b6a; border-color: #2f7b53; color: #ffffff;
      animation: jtp-pop .28s cubic-bezier(.32,1.6,.4,1); }
    .jtp-badge.unpicked { animation: jtp-shrink .24s ease; }
    .jtp-badge.hidden { opacity: 0; pointer-events: none; }
    .jtp-tip { position: absolute; transform: translate(-50%, -130%); padding: 4px 8px;
      border-radius: 6px; background: #1a2b22; color: #fff; font-size: 11px; line-height: 1.2;
      white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .12s ease; }
    .jtp-badge:hover + .jtp-tip { opacity: 1; }
    @keyframes jtp-spin { to { transform: rotate(360deg); } }
    @keyframes jtp-pop { 0% { transform: scale(.7); } 60% { transform: scale(1.14); } 100% { transform: scale(1); } }
    @keyframes jtp-shrink { 0% { transform: scale(1.1); } 100% { transform: scale(1); } }
  `;

  const SVGNS = "http://www.w3.org/2000/svg";
  const GLYPH = {
    plus: "M12 5v14M5 12h14",
    check: "M20 6L9 17l-5-5",
    spinner: "M21 12a9 9 0 1 1-6.2-8.56",
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
  let registry = new Map(); // key → { key, badge, tip, anchors, question, order, state }
  let selected = new Set(); // keys
  let hooks = {};
  let mo = null;
  let moTimer = null;
  let rafPending = false;
  let pageOrder = []; // keys in harvest (page) order, refreshed per harvest

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
    shadow.append(style, layer);
    document.documentElement.append(host);
  }

  // ---- badge state machine -----------------------------------------------------------------
  function setBadgeState(entry, state) {
    entry.state = state;
    const b = entry.badge;
    b.classList.toggle("working", state === "working");
    b.classList.toggle("selected", state === "selected");
    b.replaceChildren(
      glyph(state === "working" ? "spinner" : state === "selected" ? "check" : "plus"),
    );
    b.setAttribute("aria-pressed", state === "selected" ? "true" : "false");
    const tipText = state === "selected" ? "Tracked — click to remove" : "Track this question";
    b.setAttribute("aria-label", tipText);
    entry.tip.textContent = tipText;
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
    }, wasSelected ? REMOVE_DELAY_MS : ADD_DELAY_MS);
  }

  function makeEntry(key, question) {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "jtp-badge";
    const tip = document.createElement("span");
    tip.className = "jtp-tip";
    const entry = { key, question, badge, tip, anchors: [], order: 0, state: "idle" };
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onBadgeClick(entry);
    });
    layer.append(badge, tip);
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
        entry.tip.remove();
        registry.delete(key);
      }
    }
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
      if (!r || r.bottom < 0 || r.top > ih) {
        b.classList.add("hidden");
        continue;
      }
      // Outside placement (right of the control) when there's room before the viewport edge
      // AND the panel; otherwise tuck at the control's top-right corner in the label gap —
      // never over the field's text or its question label.
      let left;
      let top;
      const outsideLeft = r.right + GAP;
      if (outsideLeft + BADGE + 4 <= Math.min(iw, panelLeft)) {
        left = outsideLeft;
        top = (r.top + r.bottom) / 2 - BADGE / 2;
      } else {
        left = r.right - BADGE - 6;
        top = r.top - BADGE / 2;
      }
      if (left + BADGE / 2 > panelLeft) {
        b.classList.add("hidden"); // under the open panel
        continue;
      }
      b.classList.remove("hidden");
      b.style.left = Math.max(2, Math.min(left, iw - BADGE - 2)) + "px";
      b.style.top = Math.max(2, Math.min(top, ih - BADGE - 2)) + "px";
      entry.tip.style.left = parseFloat(b.style.left) + BADGE / 2 + "px";
      entry.tip.style.top = b.style.top;
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

  function onMutations() {
    clearTimeout(moTimer);
    moTimer = setTimeout(() => {
      if (active) refresh();
    }, REHARVEST_MS);
  }

  function startObservers() {
    root.addEventListener("scroll", schedulePosition, { capture: true, passive: true });
    root.addEventListener("resize", schedulePosition, { passive: true });
    try {
      mo = new MutationObserver(onMutations);
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  function stopObservers() {
    root.removeEventListener("scroll", schedulePosition, { capture: true });
    root.removeEventListener("resize", schedulePosition);
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
    registry = new Map();
    pageOrder = [];
  }

  function setSelectedKeys(keys) {
    selected = new Set(keys || []);
    for (const [key, entry] of registry) {
      if (entry.state === "working") continue;
      setBadgeState(entry, selected.has(key) ? "selected" : "idle");
    }
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
