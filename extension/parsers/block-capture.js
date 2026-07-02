// Block emitter — the addressable half of capture v2.
//
// Walks an (already cleaned — see clean-dom.js) DOM subtree and emits ORDERED, TYPED blocks
// instead of one flat markdown string. Blocks are what the backend numbers (B12| …) so the
// LLM can answer with block RANGES (description) instead of regenerating text, and field
// blocks carry the harvested question id so the LLM classifies REAL controls, never invents.
//
// Deterministic, no LLM, no site-specific code. Controls are serialized through a single
// `markerFor(el)` callback — capture.js supplies one that keeps a counter in lockstep with
// the LIVE document's control order (see capture.js), so every control must pass through
// markerFor exactly once, in pre-order, whether it sits at flow level or inside a table cell.
(function (root, factory) {
  "use strict";
  const api = factory();
  const NS = (root.JobTracker = root.JobTracker || {});
  NS.blocks = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const HEADING = { H1: "#", H2: "##", H3: "###", H4: "####", H5: "#####", H6: "######" };
  const BLOCK = new Set([
    "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "P", "UL", "OL", "FIELDSET",
    "FORM", "NAV", "ASIDE", "TABLE", "THEAD", "TBODY", "TFOOT", "BLOCKQUOTE", "DL", "DT",
    "DD", "LABEL", "LEGEND",
  ]);
  const CONTROL = new Set(["INPUT", "TEXTAREA", "SELECT"]);
  const BLOCK_TEXT_MAX = 2000;

  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

  function isControl(el) {
    return (
      !!el &&
      el.nodeType === 1 &&
      (CONTROL.has(el.tagName) || (el.hasAttribute && el.hasAttribute("contenteditable")))
    );
  }

  // The pre-v2 typed markers — used for controls the harvest didn't claim (page noise the
  // inclusion decisions still want to SEE, e.g. a search box) and as the test-friendly default.
  function legacyMarker(el) {
    const tag = el.tagName;
    if (tag === "INPUT") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      if (t === "hidden") return "";
      const ph = el.getAttribute("placeholder");
      if (t === "checkbox" || t === "radio") {
        const v = el.getAttribute("value");
        return `(${t}${v ? ": " + v : ""})`;
      }
      return `[${t}${ph ? ": " + ph : ""}]`;
    }
    if (tag === "TEXTAREA") {
      const ph = el.getAttribute("placeholder");
      return `[long text${ph ? ": " + ph : ""}]`;
    }
    if (tag === "SELECT") {
      const opts = Array.from(el.querySelectorAll("option"))
        .map((o) => norm(o.textContent))
        .filter(Boolean);
      return `[dropdown: ${opts.join(" | ")}]`;
    }
    if (el.hasAttribute && el.hasAttribute("contenteditable")) return "[rich text]";
    return "";
  }

  // The marker the LLM sees for a HARVESTED control — one line carrying everything the
  // classification needs, keyed by the harvest's stable field id.
  function renderFieldMarker(field) {
    const KIND_LABEL = {
      select: "dropdown",
      radio: "single choice",
      checkbox: "checkboxes",
      textarea: "long text",
      file: "file upload",
      combobox: "combobox",
      contenteditable: "rich text",
      text: "text",
    };
    const t = (field.inputType || "").toLowerCase();
    const kind =
      field.kind === "text" && t && t !== "text" ? t : KIND_LABEL[field.kind] || field.kind;
    let s = `[field ${field.id}: ${kind}`;
    if (field.label) s += ` "${norm(field.label)}"`;
    if (field.required) s += " (required)";
    const opts = Array.isArray(field.options)
      ? field.options
          .map((o) => (typeof o === "string" ? o : o && o.label))
          .map(norm)
          .filter(Boolean)
      : [];
    if (opts.length) s += ` — options: ${opts.join(" | ")}`;
    if (field.placeholder) s += ` — placeholder: "${norm(field.placeholder)}"`;
    return s + "]";
  }

  // Serialize INLINE content (headings, list items, table cells). Recurses through
  // everything, flattening any stray nested blocks; controls go through markerFor so the
  // live-order counter still advances for controls that render inline.
  function inline(node, markerFor) {
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    if (isControl(node)) {
      const m = markerFor(node);
      return m ? " " + m + " " : "";
    }
    const tag = node.tagName;
    if (tag === "OPTION") return "";
    if (tag === "IMG") {
      const a = node.getAttribute("alt");
      return a ? `[image: ${a}] ` : "";
    }
    if (tag === "BR") return " ";
    let out = "";
    for (const ch of node.childNodes) out += inline(ch, markerFor);
    return out;
  }

  function emitBlocks(rootNode, opts) {
    const markerFor = (opts && opts.markerFor) || legacyMarker;
    const blocks = [];
    let buf = "";

    // Push one logical block; oversized text splits into same-kind continuation blocks so a
    // giant paragraph is never silently truncated.
    const pushText = (kind, text) => {
      let t = norm(text);
      if (!t) return;
      while (t.length > BLOCK_TEXT_MAX) {
        // split on the last space before the cap so words survive intact
        let cut = t.lastIndexOf(" ", BLOCK_TEXT_MAX);
        if (cut < BLOCK_TEXT_MAX / 2) cut = BLOCK_TEXT_MAX;
        blocks.push({ kind, text: t.slice(0, cut).trim() });
        t = t.slice(cut).trim();
      }
      if (t) blocks.push({ kind, text: t });
    };
    const flush = () => {
      const t = buf;
      buf = "";
      pushText("para", t);
    };
    const push = (kind, text) => {
      flush();
      pushText(kind, text);
    };

    function walk(node) {
      if (node.nodeType === 3) {
        buf += node.nodeValue.replace(/\s+/g, " ");
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;

      if (isControl(node)) {
        const m = markerFor(node);
        if (m) push("field", m);
        else flush(); // still a boundary — keeps label text from gluing to the next field
        return;
      }
      if (tag === "OPTION") return;
      if (tag === "IMG") {
        const a = node.getAttribute("alt");
        if (a) buf += `[image: ${a}] `;
        return;
      }
      if (tag === "BR") {
        buf += " ";
        return;
      }
      if (HEADING[tag]) {
        push("heading", HEADING[tag] + " " + norm(inline(node, markerFor)));
        return;
      }
      if (tag === "LI") {
        // The item's own inline content becomes one li block; nested block children (a
        // sub-list, wrapped paragraphs) walk AFTER it as their own blocks.
        const blockKids = [];
        let own = "";
        for (const ch of node.childNodes) {
          if (
            ch.nodeType === 1 &&
            (BLOCK.has(ch.tagName) || ch.tagName === "LI" || ch.tagName === "TR" || HEADING[ch.tagName])
          ) {
            blockKids.push(ch);
          } else {
            own += inline(ch, markerFor);
          }
        }
        push("li", "- " + norm(own));
        for (const k of blockKids) walk(k);
        return;
      }
      if (tag === "TR") {
        const cells = Array.from(node.children).filter(
          (c) => c.tagName === "TD" || c.tagName === "TH",
        );
        push(
          "row",
          cells.map((c) => norm(inline(c, markerFor))).join(" | "),
        );
        return;
      }
      if (BLOCK.has(tag)) {
        flush();
        for (const ch of node.childNodes) walk(ch);
        flush();
        return;
      }
      // Inline element (span/strong/a/button/…): flatten into the running paragraph.
      buf += inline(node, markerFor);
    }

    walk(rootNode);
    flush();
    blocks.forEach((b, idx) => (b.i = idx));
    return blocks;
  }

  return { emitBlocks, legacyMarker, renderFieldMarker, isControl, BLOCK_TEXT_MAX };
});
