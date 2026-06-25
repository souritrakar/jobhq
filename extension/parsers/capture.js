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

  const TEXT_MAX = 50000; // hard cap on text sent to the model (matches the API cap)
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

  // Build the model input as serialized, simplified HTML (not innerText) so links (with
  // href), headings, lists, and form labels/inputs survive. The pipeline is:
  //   live <body> → cleanDom (deterministic) → serialized HTML.
  // cleanDom clones first, so the live page is never mutated.
  //
  // NB: there is deliberately NO heuristic "main-content" (Readability) stage here. We
  // tried it and it silently dropped must-have fields — e.g. the company name, which on
  // real ATS pages (Ashby, Lever, Greenhouse) lives in a header/nav link that Readability
  // prunes as chrome. Its guards couldn't catch this either: those pages render inputs
  // with no <form> element, so a form-presence fallback never fires. cleanDom alone
  // already shrinks a page ~80–90%, so the extra trim wasn't worth losing real data.
  // Don't re-add content extraction without a guard that's proven not to drop fields.
  function pageHtml() {
    const cleanDom = NS.cleanDom && NS.cleanDom.cleanDom;
    if (!cleanDom) {
      // Defensive: if the clean-dom module didn't load, degrade to plain text so a save
      // still works rather than sending nothing.
      clog("cleanDom module missing — falling back to innerText");
      return (document.body.innerText || "").trim().slice(0, TEXT_MAX);
    }

    const cleaned = cleanDom(document.body);
    // innerHTML (not outerHTML) drops the meaningless wrapper <body> tag. Collapse any
    // remaining inter-tag whitespace runs.
    const html = (cleaned.innerHTML || "").replace(/\s{2,}/g, " ").trim().slice(0, TEXT_MAX);
    clog("raw body html:", document.body.innerHTML.length, "→ sent:", html.length, "chars");
    return html;
  }

  function scopePage() {
    return {
      text: pageHtml(),
      url: cleanHref(),
      source: hostname(),
      titleHint: (document.title || "").trim(),
    };
  }

  NS.scope = { scopePage };
})(self);
