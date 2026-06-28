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

  const TEXT_MAX = 24000; // hard cap on text sent to the model — markdown is dense, so this is plenty
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

  // Build the model input as compact MARKDOWN, not HTML. Pipeline:
  //   live <body> → cleanDom (deterministic) → markdown serialization.
  // cleanDom clones first, so the live page is never mutated. Markdown is dramatically more
  // token-efficient than tag-dense HTML (~4 chars/token vs ~2) while keeping every signal the model
  // needs — headings, link text, lists, AND form labels/inputs/options — so big ATS pages (Greenhouse)
  // stay well under the model's per-request token limit (HTML blew past Groq's free-tier 12k TPM).
  // Form structure is preserved: each control becomes a compact marker — [text], [long text],
  // [dropdown: a | b], (radio), (checkbox) — so the question extractor still sees field types.
  //
  // NB: there is deliberately NO heuristic "main-content" (Readability) stage here. It silently
  // dropped must-have fields — e.g. the company name, which on real ATS pages lives in a header/nav
  // link Readability prunes as chrome. Don't re-add content extraction without a proven guard.
  const HEADING = { H1: "#", H2: "##", H3: "###", H4: "####", H5: "#####", H6: "######" };
  const BLOCK = new Set([
    "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "P", "UL", "OL", "FIELDSET", "FORM",
    "NAV", "ASIDE", "TABLE", "TR",
  ]);

  // Serialize a (cleaned) DOM node to compact markdown. Reads only; never mutates.
  function toMarkdown(node) {
    if (!node) return "";
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    const tag = node.tagName;

    // Form controls → compact, type-preserving markers (the question extractor reads these).
    if (tag === "INPUT") {
      const t = (node.getAttribute("type") || "text").toLowerCase();
      if (t === "hidden") return "";
      const ph = node.getAttribute("placeholder");
      if (t === "checkbox" || t === "radio") {
        const v = node.getAttribute("value");
        return ` (${t}${v ? ": " + v : ""})`;
      }
      return ` [${t}${ph ? ": " + ph : ""}]`;
    }
    if (tag === "TEXTAREA") {
      const ph = node.getAttribute("placeholder");
      return ` [long text${ph ? ": " + ph : ""}]`;
    }
    if (tag === "SELECT") {
      const opts = Array.from(node.querySelectorAll("option"))
        .map((o) => (o.textContent || "").trim())
        .filter(Boolean);
      return ` [dropdown: ${opts.join(" | ")}]`;
    }
    if (tag === "OPTION") return ""; // emitted by its <select>
    if (tag === "IMG") { const a = node.getAttribute("alt"); return a ? `[image: ${a}] ` : ""; }
    if (tag === "BR") return "\n";

    let inner = "";
    for (const ch of node.childNodes) inner += toMarkdown(ch);

    if (HEADING[tag]) return `\n\n${HEADING[tag]} ${inner.trim()}\n`;
    if (tag === "LI") return `\n- ${inner.trim()}`;
    if (tag === "LABEL" || tag === "LEGEND") return `\n${inner.trim()} `;
    if (tag === "A") return inner; // link TEXT only — href dropped (the page url is sent separately)
    if (BLOCK.has(tag)) return `\n${inner}`;
    return inner; // inline (span/strong/button/…): keep text, drop the tag
  }

  function pageHtml() {
    const cleanDom = NS.cleanDom && NS.cleanDom.cleanDom;
    const root = cleanDom ? cleanDom(document.body) : document.body;
    const md = toMarkdown(root)
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, TEXT_MAX);
    clog("raw body html:", document.body.innerHTML.length, "→ markdown:", md.length, "chars");
    return md;
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

  function scopePage() {
    return {
      text: pageHtml(),
      url: cleanHref(),
      source: hostname(),
      titleHint: (document.title || "").trim(),
      // Machine-readable signals for the tiered extractor. Harvested from the live DOM (pre-clean),
      // so they coexist with `text` — the LLM path keeps using `text`, the tiered path uses `signals`.
      signals: harvestStructuredSignals(),
    };
  }

  NS.scope = { scopePage, harvestStructuredSignals };
})(self);
