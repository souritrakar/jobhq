// Cross-frame bridge for the live application-form sync.
//
// Many application forms (LinkedIn's off-site apply, Greenhouse/Lever/Ashby/Workday embeds)
// render inside a cross-origin IFRAME. The panel lives in the TOP frame, but harvestQuestions()
// only ever sees its own document — so without help, an iframe'd form is invisible. With
// manifest `all_frames:true`, the content script (and form-sync) runs in EVERY frame; this module
// stitches those frames together:
//
//   • AGENT (sub-frames) — runs the local form-sync headless (no panel) and RELAYS its model +
//     value changes up to the top frame; applies setAnswer / dismiss / deactivate coming down.
//   • AGGREGATOR (top frame) — exposes the EXACT form-sync API the orchestrator already consumes
//     (activate / getQuestions / getAnswers / getIgnoredKeys / setAnswer / dismiss / deactivate /
//     isActive). Internally it treats the local form-sync AND each remote frame as a "source",
//     merges their models into ONE first-seen-ordered model, owns the authoritative answer store
//     (page-non-empty wins; explicit clears kept), and routes edits/dismiss to the owning source.
//
// Keys stay pure questionMapper.keyOf (persistence + web-app interop depend on it); frame
// ownership is tracked in a side map, never mixed into the key. Transport is INJECTED (chrome
// messaging in production, a fake in tests) so the merge/route logic is unit-testable with no
// chrome. Isolated-world global: JobTracker.ui.frameBridge; UMD-exported for tests.
(function (root, factory) {
  "use strict";
  const NS = (root.JobTracker = root.JobTracker || {});
  NS.ui = NS.ui || {};
  const api = factory(root);
  NS.ui.frameBridge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  const LOCAL = "local"; // the top frame's own form-sync source id

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

  // ============================================================================================
  // AGGREGATOR (top frame) — the form-sync-compatible facade over local + remote frame sources.
  // ============================================================================================
  function createAggregator(localFormSync, transport, mapper) {
    mapper = mapper || (root.JobTracker && root.JobTracker.questionMapper) || null;

    let active = false;
    let hooks = {}; // { onModel, onAnswer }
    let lastShape = "";
    const ignored = new Set();
    const dirty = new Set(); // keys explicitly changed this session (an "" clear only counts here)

    // Per-source last-reported snapshot: sourceId → Map(key → { question, answer, onPage }).
    const sources = new Map();
    // Aggregate, keyed by pure mapper key.
    const Q = new Map(); // key → stable question object (first-seen; the panel mutates `flagged` on it)
    const A = new Map(); // key → authoritative answer (panel + persistence truth)
    const seq = new Map(); // key → first-seen sequence (sole ordering basis)
    let seqCounter = 0;

    function ensureSeq(key) {
      if (!seq.has(key)) seq.set(key, seqCounter++);
    }
    function ensureQuestion(key, question) {
      if (!question) return;
      const kept = Q.get(key);
      if (!kept) {
        Q.set(key, question);
        return;
      }
      // Keep the stable object (identity fields can't change — they ARE the key); refresh metadata.
      if (question.required) kept.required = true;
      else delete kept.required;
      if (question.placeholder) kept.placeholder = question.placeholder;
      else delete kept.placeholder;
    }

    function keysInOrder() {
      return Array.from(seq.keys())
        .filter((k) => !ignored.has(k) && Q.has(k))
        .sort((a, b) => seq.get(a) - seq.get(b));
    }
    // On-page if ANY source currently reports it on-page.
    function onPageOf(key) {
      for (const snap of sources.values()) {
        const it = snap.get(key);
        if (it && it.onPage) return true;
      }
      return false;
    }
    // The source to route an edit/dismiss to: prefer one reporting it on-page, else any that has it.
    function ownerOf(key) {
      let fallback = null;
      for (const [sid, snap] of sources) {
        const it = snap.get(key);
        if (!it) continue;
        if (it.onPage) return sid;
        if (fallback == null) fallback = sid;
      }
      return fallback;
    }
    function buildModel() {
      return keysInOrder().map((k) => ({
        key: k,
        question: Q.get(k),
        answer: A.has(k) ? A.get(k) : "",
        onPage: onPageOf(k),
      }));
    }
    function emitModelIfChanged(force) {
      const shape = keysInOrder()
        .map((k) => k + "|" + (onPageOf(k) ? 1 : 0))
        .join("\n");
      if (!force && shape === lastShape) return;
      lastShape = shape;
      if (typeof hooks.onModel === "function") {
        try {
          hooks.onModel(buildModel());
        } catch (_) {}
      }
    }
    // Update the authoritative answer and notify. Callers guarantee empty page values from a plain
    // re-harvest never reach here (only non-empty reads and genuine event-driven clears do).
    function setAggAnswer(key, value, fromPage) {
      if (ignored.has(key)) return;
      ensureSeq(key);
      if (valueEq(A.has(key) ? A.get(key) : "", value)) return;
      A.set(key, value);
      dirty.add(key);
      if (typeof hooks.onAnswer === "function") {
        try {
          hooks.onAnswer(key, value, fromPage);
        } catch (_) {}
      }
    }

    // Ingest a source's full model (its structure snapshot). Page-non-empty answers update the store.
    function ingestModel(sourceId, items) {
      const snap = new Map();
      for (const it of items || []) {
        if (!it || !it.key || ignored.has(it.key)) continue;
        snap.set(it.key, { question: it.question, answer: it.answer, onPage: !!it.onPage });
        ensureSeq(it.key);
        ensureQuestion(it.key, it.question);
        if (!emptyAnswer(it.answer)) setAggAnswer(it.key, it.answer, true);
      }
      sources.set(sourceId, snap);
      emitModelIfChanged(false);
    }
    // Ingest a single value change from a source (fromPage — includes genuine clears to "").
    function ingestAnswer(sourceId, key, value) {
      if (ignored.has(key)) return;
      const snap = sources.get(sourceId);
      if (snap && snap.has(key)) snap.get(key).answer = value;
      setAggAnswer(key, value, true);
    }

    // ---- source wiring -------------------------------------------------------------------------
    function wireLocal(opts) {
      return localFormSync.activate({
        questions: opts.questions,
        answers: opts.answers,
        ignoredKeys: opts.ignoredKeys,
        onModel: (items) => ingestModel(LOCAL, items),
        onAnswer: (key, value, fromPage) => {
          if (fromPage) ingestAnswer(LOCAL, key, value);
        },
      });
    }
    if (transport && typeof transport.onFrameMessage === "function") {
      transport.onFrameMessage((frameId, payload) => {
        if (!payload) return;
        switch (payload.kind) {
          case "hello":
            // A frame's agent came online. If we're already mirroring, start it now (late-loading
            // iframe — the apply form often mounts after the panel is open).
            if (active) transport.sendToFrame(frameId, { kind: "activate", ignoredKeys: Array.from(ignored) });
            break;
          case "model":
            if (active) ingestModel(frameId, payload.items);
            break;
          case "answer":
            if (active) ingestAnswer(frameId, payload.key, payload.value);
            break;
        }
      });
    }

    // ---- public API (form-sync compatible) -----------------------------------------------------
    function activate(opts) {
      opts = opts || {};
      hooks = { onModel: opts.onModel, onAnswer: opts.onAnswer };
      active = true;
      lastShape = "";
      ignored.clear();
      dirty.clear();
      sources.clear();
      Q.clear();
      A.clear();
      seq.clear();
      seqCounter = 0;
      for (const k of opts.ignoredKeys || []) ignored.add(k);
      // Seed restored questions/answers into the aggregate FIRST, so they appear (and lead the
      // order) even if their owning frame hasn't loaded yet, and a restored answer survives a
      // blank remote report from whichever frame later owns the question.
      const answers = opts.answers || {};
      for (const q of opts.questions || []) {
        if (!q || !q.label || !mapper) continue;
        const key = mapper.keyOf(q);
        if (ignored.has(key)) continue;
        ensureSeq(key);
        ensureQuestion(key, q);
        if (key in answers && !emptyAnswer(answers[key])) A.set(key, answers[key]);
      }
      // Wake every sub-frame, then mirror the top frame's own document as the local source.
      if (transport && typeof transport.broadcast === "function") {
        transport.broadcast({ kind: "activate", ignoredKeys: Array.from(ignored) });
      }
      const p = wireLocal(opts) || Promise.resolve();
      emitModelIfChanged(true); // initial paint even before any source reports
      return Promise.resolve(p).catch(() => {});
    }

    function setAnswer(key, value) {
      setAggAnswer(key, value, false);
      const owner = ownerOf(key);
      if (owner == null || owner === LOCAL) {
        localFormSync.setAnswer(key, value); // top-frame control (or a harmless no-op when absent)
      } else if (transport && typeof transport.sendToFrame === "function") {
        transport.sendToFrame(owner, { kind: "setAnswer", key, value });
      }
    }

    function dismiss(key) {
      if (ignored.has(key)) return;
      ignored.add(key);
      Q.delete(key);
      A.delete(key);
      seq.delete(key);
      dirty.delete(key);
      for (const snap of sources.values()) snap.delete(key);
      localFormSync.dismiss(key);
      if (transport && typeof transport.broadcast === "function") {
        transport.broadcast({ kind: "dismiss", key });
      }
      emitModelIfChanged(true);
    }

    function deactivate() {
      if (!active) return;
      active = false;
      try {
        localFormSync.deactivate();
      } catch (_) {}
      if (transport && typeof transport.broadcast === "function") {
        transport.broadcast({ kind: "deactivate" });
      }
      sources.clear();
      Q.clear();
      A.clear();
      seq.clear();
      ignored.clear();
      dirty.clear();
      seqCounter = 0;
      lastShape = "";
      hooks = {};
    }

    function getQuestions() {
      return keysInOrder().map((k) => Q.get(k)).filter(Boolean);
    }
    function getAnswers() {
      const out = {};
      for (const key of keysInOrder()) {
        const v = A.has(key) ? A.get(key) : "";
        if (!emptyAnswer(v)) out[key] = v;
        else if (dirty.has(key)) out[key] = "";
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
    };
  }

  // ============================================================================================
  // AGENT (sub-frames) — headless form-sync driver that relays to the top-frame aggregator.
  // ============================================================================================
  function startAgent(localFormSync, transport) {
    if (!localFormSync || !transport) return;
    transport.onCommand((payload) => {
      if (!payload) return;
      switch (payload.kind) {
        case "activate":
          localFormSync
            .activate({
              ignoredKeys: payload.ignoredKeys || [],
              onModel: (items) => transport.sendUp({ kind: "model", items }),
              onAnswer: (key, value, fromPage) => {
                if (fromPage) transport.sendUp({ kind: "answer", key, value });
              },
            })
            .catch(() => {});
          break;
        case "setAnswer":
          localFormSync.setAnswer(payload.key, payload.value);
          break;
        case "dismiss":
          localFormSync.dismiss(payload.key);
          break;
        case "deactivate":
          localFormSync.deactivate();
          break;
      }
    });
    // Announce presence so an already-open panel activates this frame immediately.
    transport.sendUp({ kind: "hello" });
  }

  // ============================================================================================
  // Chrome-messaging transports (production). Relayed through the background service worker,
  // which stamps sender.frameId / sender.tab.id (a content script can't know its own tab id).
  // ============================================================================================
  function swallow() {
    void (root.chrome && root.chrome.runtime && root.chrome.runtime.lastError);
  }
  function chromeAggregatorTransport() {
    const chrome = root.chrome;
    return {
      broadcast(payload) {
        chrome.runtime.sendMessage({ type: "FS_BROADCAST", payload }, swallow);
      },
      sendToFrame(frameId, payload) {
        chrome.runtime.sendMessage({ type: "FS_TO_FRAME", frameId, payload }, swallow);
      },
      onFrameMessage(handler) {
        chrome.runtime.onMessage.addListener((msg) => {
          if (msg && msg.type === "FS_DOWN") handler(msg.fromFrameId, msg.payload);
        });
      },
    };
  }
  function chromeAgentTransport() {
    const chrome = root.chrome;
    return {
      sendUp(payload) {
        chrome.runtime.sendMessage({ type: "FS_UP", payload }, swallow);
      },
      onCommand(handler) {
        chrome.runtime.onMessage.addListener((msg) => {
          if (msg && msg.type === "FS_CMD") handler(msg.payload);
        });
      },
    };
  }

  return { createAggregator, startAgent, chromeAggregatorTransport, chromeAgentTransport };
});
