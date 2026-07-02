// Page capture — the dumb, generic half of the pipeline.
//
// First-principles approach: we do NOT parse any site. We deterministically clean the
// rendered DOM into compact, simplified HTML (see clean-dom.js) and hand it to the
// backend, which runs ONE model call that returns every field (and the
// cleaned description). No per-site selectors, no field extraction here. Adding a new
// site costs nothing — there's no site-specific code to add.
//
// We read only the rendered DOM and issue no page-level fetch/XHR, which keeps us
// ban-safe on instrumented sites. Capture is user-triggered (Save click), so we never
// touch the page until the user asks to save.
//
// Runs as a content-script global: self.JobTracker.scope.scopePage().
(function (root) {
  const NS = (root.JobTracker = root.JobTracker || {});

  // TEXT_MAX bounds the markdown sent to the WHOLE-PAGE LLM path (POST /api/extract) — Groq's free
  // tier 413s past ~3.5k tokens, so this stays conservative. The SEMANTIC path (POST
  // /api/extract/semantic) does NOT use this: it gets fullText and bounds the model context itself
  // via section-chunked retrieval, so it never truncates and never loses information.
  const TEXT_MAX = 6000;
  const FULL_TEXT_MAX = 100000; // generous ceiling for the semantic path (guards only pathological pages)
  const DEBUG = true; // dev-only: log char counts (page console)

  function clog(...a) {
    if (DEBUG) console.log("[JobTracker:capture]", ...a);
  }

  function hostname() {
    return location.hostname.replace(/^www\./, "");
  }
  function cleanHref() {
    try {
      const u = new URL(location.href);
      return u.origin + u.pathname;
    } catch {
      return location.href;
    }
  }

  // ---- capture v2: block index -------------------------------------------------------------
  // Pipeline: live <body> → cleanDom (deterministic clone; page never mutated) → block emitter
  // (parsers/block-capture.js). One walk produces addressable, typed blocks; the legacy flat
  // strings (`text`/`fullText`) are DERIVED from the blocks so the old paths keep working until
  // they're deleted. Form structure is preserved as field blocks — harvested controls carry the
  // harvest's stable q<N> id, everything else keeps the anonymous typed marker.
  //
  // NB: there is deliberately NO heuristic "main-content" (Readability) stage here. It silently
  // dropped must-have fields — e.g. the company name, which on real ATS pages lives in a header/nav
  // link Readability prunes as chrome. Don't re-add content extraction without a proven guard.
  const CONTROL_SELECTOR = "input, textarea, select, [contenteditable]";

  // Build the markerFor callback for a capture pass. The block emitter walks a CLEANED CLONE,
  // so live-element identity is gone — we recover it by ORDER: the Nth control encountered in
  // the clone (pre-order) is the Nth control in the live body. clean-dom preserves every
  // control (KEEP_IF_EMPTY) and the contenteditable attribute (KEPT_ATTRS), so the two
  // sequences match. Harvested controls render the rich [field q<N>: …] marker (one per GROUP —
  // repeats suppress); everything else keeps the legacy anonymous marker.
  function makeMarkerFor(harvest) {
    const liveControls = Array.from(document.body.querySelectorAll(CONTROL_SELECTOR));
    const byId = new Map(((harvest && harvest.fields) || []).map((f) => [f.id, f]));
    const controlIds = harvest && harvest.controlIds;
    const emitted = new Set();
    let n = 0;
    return function markerFor(cloneEl) {
      const live = liveControls[n++];
      const B = NS.blocks;
      if (!live || !controlIds) return B.legacyMarker(cloneEl);
      const fid = controlIds.get(live);
      const field = fid && byId.get(fid);
      if (!field) return B.legacyMarker(cloneEl);
      if (emitted.has(fid)) return ""; // one field block per radio/checkbox group
      emitted.add(fid);
      return B.renderFieldMarker(field);
    };
  }

  // Serialize the cleaned DOM to blocks, bounded by FULL_TEXT_MAX total chars.
  function pageBlocks(harvest) {
    const cleanDom = NS.cleanDom && NS.cleanDom.cleanDom;
    const root = cleanDom ? cleanDom(document.body) : document.body;
    const all = NS.blocks.emitBlocks(root, { markerFor: makeMarkerFor(harvest) });
    let total = 0;
    const blocks = [];
    for (const b of all) {
      total += b.text.length;
      if (total > FULL_TEXT_MAX) {
        clog("block capture clamped at", FULL_TEXT_MAX, "chars —", all.length - blocks.length, "blocks dropped");
        break;
      }
      blocks.push(b);
    }
    clog("raw body html:", document.body.innerHTML.length, "→", blocks.length, "blocks,", total, "chars");
    return blocks;
  }

  // ---- settle gate ---------------------------------------------------------------------------
  // Capture is click-triggered, so the page is normally rendered — but slow-hydrating SPA forms
  // exist. Wait until readyState is complete AND the DOM has been mutation-quiet for `quietMs`,
  // capped at `maxMs`, then capture regardless. Deterministic, cheap, no polling loops.
  function settle({ quietMs = 300, maxMs = 2500 } = {}) {
    return new Promise((resolve) => {
      let done = false;
      let quietTimer = null;
      let obs = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(quietTimer);
        clearTimeout(capTimer);
        if (obs) obs.disconnect();
        resolve();
      };
      const capTimer = setTimeout(finish, maxMs);
      const armQuiet = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => {
          if (document.readyState === "complete") finish();
          else armQuiet(); // still loading — re-arm; the cap bounds us
        }, quietMs);
      };
      try {
        obs = new MutationObserver(armQuiet);
        obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      } catch (_) {}
      armQuiet();
    });
  }

  // ---- structured signals (for the TIERED, non-LLM extractor) -------------------------------------
  // Read the LIVE document's machine-readable metadata BEFORE cleanDom runs — cleanDom strips
  // <script>/<meta>, so JSON-LD and OG tags must be harvested here, upstream of the markdown pass.
  // Everything is generic (no per-site selectors) and bounded. The backend parses these deterministically
  // (JSON-LD schema.org/JobPosting → meta → key/value segments) and only embeds the leftovers.
  function tx(el) {
    return ((el && el.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function harvestJsonLd() {
    const out = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      const t = (s.textContent || "").trim();
      if (t && out.length < 15) out.push(t.slice(0, 20000));
    });
    return out;
  }

  function harvestMeta() {
    const meta = {};
    document.querySelectorAll("meta[property], meta[name]").forEach((m) => {
      const key = (m.getAttribute("property") || m.getAttribute("name") || "").toLowerCase().trim();
      const content = (m.getAttribute("content") || "").trim();
      if (!key || !content) return;
      if (!(key.startsWith("og:") || key.startsWith("twitter:") || key === "description")) return;
      if (!(key in meta) && Object.keys(meta).length < 40) meta[key] = content.slice(0, 5000);
    });
    return meta;
  }

  // Generic key→value pairs: definition lists, table rows, microdata itemprops, and inline "Key: value"
  // lines. Bounded; the backend's embedding matcher keeps only the ones whose KEY lands near a field.
  function harvestSegments() {
    const segs = [];
    const SEG_MAX = 250;
    const push = (key, value) => {
      key = (key || "").replace(/\s+/g, " ").trim();
      value = (value || "").replace(/\s+/g, " ").trim();
      if (!key || !value || segs.length >= SEG_MAX) return;
      segs.push({ key: key.slice(0, 120), value: value.slice(0, 400) });
    };
    // 1. definition lists (<dt> → following <dd>)
    document.querySelectorAll("dl").forEach((dl) => {
      const kids = Array.from(dl.children);
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].tagName !== "DT") continue;
        let j = i + 1;
        while (j < kids.length && kids[j].tagName !== "DD") j++;
        if (j < kids.length) push(tx(kids[i]), tx(kids[j]));
      }
    });
    // 2. two-column table rows (header cell or first cell = key)
    document.querySelectorAll("tr").forEach((tr) => {
      const th = tr.querySelector("th");
      const tds = tr.querySelectorAll("td");
      if (th && tds.length >= 1) push(tx(th), tx(tds[0]));
      else if (tds.length >= 2) push(tx(tds[0]), tx(tds[1]));
    });
    // 3. microdata itemprops (schema.org JobPosting and friends)
    document.querySelectorAll("[itemprop]").forEach((el) => {
      const key = el.getAttribute("itemprop");
      const value = el.getAttribute("content") || el.getAttribute("datetime") || tx(el);
      push(key, value);
    });
    // 4. inline "Key: value" lines on leaf-ish elements (e.g. "Salary: $120k", "Job type: Full-time")
    const KV = /^([A-Za-z][A-Za-z0-9 /&_-]{1,30}):\s*(.{1,400})$/;
    document.querySelectorAll("li, p, span, div").forEach((el) => {
      if (el.children.length > 2) return;
      const t = tx(el);
      if (!t || t.length > 200) return;
      const m = t.match(KV);
      if (m) push(m[1], m[2]);
    });
    return segs;
  }

  function harvestStructuredSignals() {
    return {
      jsonLd: harvestJsonLd(),
      meta: harvestMeta(),
      segments: harvestSegments(),
      h1: tx(document.querySelector("h1")).slice(0, 2000),
      titleHint: (document.title || "").trim().slice(0, 2000),
    };
  }

  function scopePage(opts) {
    // Optional harvest ({ fields, controlIds }) from UI.autofill.harvestQuestions() — when
    // present, field blocks carry the harvest's q<N> ids (the indexed pipeline's linkage).
    const harvest = (opts && opts.harvest) || null;
    const blocks = pageBlocks(harvest);
    // Legacy flat markdown, derived from the same walk (one serialization, three consumers).
    const full = blocks.map((b) => b.text).join("\n\n").slice(0, FULL_TEXT_MAX);
    return {
      // `blocks` — the addressable index for the INDEXED path (B<i>| lines on the backend).
      blocks,
      // `fields` — the harvested question descriptors that pair with the field blocks.
      fields: (harvest && harvest.fields) || [],
      // `text` — bounded markdown for the whole-page LLM path (kept small for Groq's 413 wall).
      text: full.slice(0, TEXT_MAX),
      // `fullText` — untruncated markdown for the semantic path, which bounds the model context
      // itself via section-chunked retrieval (no upstream truncation → no information loss).
      fullText: full,
      url: cleanHref(),
      source: hostname(),
      titleHint: (document.title || "").trim(),
      // Machine-readable signals for the tiered extractor. Harvested from the live DOM (pre-clean),
      // so they coexist with `text` — the LLM path keeps using `text`, the tiered path uses `signals`.
      signals: harvestStructuredSignals(),
    };
  }

  NS.scope = { scopePage, harvestStructuredSignals, settle };
  if (typeof module !== "undefined" && module.exports) module.exports = NS.scope;
})(typeof self !== "undefined" ? self : globalThis);
