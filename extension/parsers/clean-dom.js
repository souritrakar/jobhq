// Deterministic DOM cleaner — the first, generic shrink stage before the LLM call.
//
// Takes a live DOM node and returns a CLONED, cleaned subtree. It never mutates the
// live page: we clone first and do all work on the clone. The goal is to drop generic
// noise (scripts, styling, graphics, framework attributes) while preserving every bit
// of semantic content — headings, paragraphs, lists, links (with href), and form
// labels/inputs — so the downstream model reads structure, not boilerplate.
//
// Nothing here is site-specific. There are no domain, class-name, or platform branches;
// the rules below apply to any website. To tune behaviour, edit the exported constants.
//
// Runs as a content-script global: self.JobTracker.cleanDom.cleanDom(node).
(function (root) {
  const NS = (root.JobTracker = root.JobTracker || {});

  // Elements removed wholesale — generic noise that never carries reading value.
  //  - script/style/noscript: code and CSS, not content.
  //  - svg/canvas: graphics; they serialize into huge path/coordinate blobs for no gain.
  //  - iframe: a separate embedded document, not this page's content.
  //  - link/meta: <head> plumbing (preloads, viewport, tracking tags), not body text.
  // (HTML comment nodes are also removed — see removeNoise — but aren't tag names.)
  const REMOVED_TAGS = new Set([
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "iframe",
    "link",
    "meta",
  ]);

  // Attribute ALLOWLIST (allowlist, not blocklist — blocklists leak new tracking attrs).
  // Only attributes that carry meaning for extraction survive; everything else — style,
  // class, id, data-*, on*-handlers, framework/tracking attrs — is dropped. class/id are
  // intentionally NOT here: for content-only extraction they're styling/tracking hooks,
  // not meaning. Add "class"/"id" below if a future need proves otherwise.
  const KEPT_ATTRS = new Set([
    "href",
    "alt",
    "title",
    "aria-label",
    "datetime",
    "type",
    "name",
    "value",
    "placeholder",
    "label",
    "role",
    // capture v2: the block emitter and the live-control counter must both see
    // contenteditable on the cleaned clone, or clone/live control order drifts.
    "contenteditable",
  ]);

  // Elements that stay even when they hold no text and no children: void/replaced/
  // interactive nodes are themselves meaningful (an empty <input> is a form field, a
  // <br>/<hr> is structure). Without this, the empty-prune below would delete them.
  const KEEP_IF_EMPTY = new Set([
    "input",
    "textarea",
    "select",
    "option",
    "img",
    "br",
    "hr",
    "td",
    "th",
    "source",
    "area",
    "col",
  ]);

  // Clone the node, then run the passes in order. The live DOM is never touched: every
  // mutation below happens on `clone`. cloneNode(true) also makes any cloned <script>
  // inert, so the clone can't execute anything.
  function cleanDom(node) {
    if (!node) return null;
    const clone = node.cloneNode(true);
    removeNoise(clone); // 1. drop comments + REMOVED_TAGS subtrees
    stripAttrs(clone); // 2. keep only allowlisted attributes
    normalizeText(clone); // 3. collapse whitespace runs in text nodes
    pruneEmptyChildren(clone); // 4. bottom-up removal of now-empty elements
    return clone;
  }

  // 1. Remove HTML comments and every REMOVED_TAGS element (with its subtree).
  function removeNoise(rootEl) {
    const walker = (rootEl.ownerDocument || document).createTreeWalker(
      rootEl,
      NodeFilter.SHOW_COMMENT,
    );
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach((c) => c.remove());

    const selector = Array.from(REMOVED_TAGS).join(",");
    rootEl.querySelectorAll(selector).forEach((el) => el.remove());
  }

  // 2. Strip every attribute not in the allowlist, from the root and all descendants.
  function stripAttrs(rootEl) {
    const els = [rootEl, ...rootEl.querySelectorAll("*")];
    for (const el of els) {
      if (!el.attributes) continue;
      // Copy names first — removing attributes mutates the live NamedNodeMap.
      for (const name of Array.from(el.attributes, (a) => a.name)) {
        if (!KEPT_ATTRS.has(name)) el.removeAttribute(name);
      }
    }
  }

  // 3. Collapse internal whitespace runs (newlines/tabs/indentation) to a single space.
  // This kills the bulk of HTML serialization bloat (source indentation between tags)
  // while preserving inline word spacing. Nodes that were already empty are dropped.
  function normalizeText(rootEl) {
    const walker = (rootEl.ownerDocument || document).createTreeWalker(
      rootEl,
      NodeFilter.SHOW_TEXT,
    );
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    for (const t of texts) {
      const collapsed = t.nodeValue.replace(/\s+/g, " ");
      if (collapsed === "") t.remove();
      else t.nodeValue = collapsed;
    }
  }

  // 4. Bottom-up prune of meaningless elements. Post-order (recurse before testing) so a
  // parent is re-judged after its children are removed. Never removes the root.
  function pruneEmptyChildren(parent) {
    for (const el of Array.from(parent.children)) {
      pruneEmptyChildren(el);
      if (isMeaningless(el)) el.remove();
    }
  }

  function isMeaningless(el) {
    const tag = el.tagName.toLowerCase();
    if (KEEP_IF_EMPTY.has(tag)) return false;
    if (el.children.length > 0) return false; // has surviving element children
    if (el.textContent.replace(/\s+/g, "").length > 0) return false; // has real text
    // No text, no children: keep only if it still holds a meaningful attribute. After
    // stripAttrs, every remaining attribute is allowlisted — so an empty <a href> stays
    // (it's a link) while a now-bare <span> goes.
    return el.attributes.length === 0;
  }

  NS.cleanDom = { cleanDom, REMOVED_TAGS, KEPT_ATTRS, KEEP_IF_EMPTY };
  if (typeof module !== "undefined" && module.exports) module.exports = NS.cleanDom;
})(typeof self !== "undefined" ? self : globalThis);
