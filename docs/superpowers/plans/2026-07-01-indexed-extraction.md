# Indexed Extraction (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three extraction paths with one block-addressed pipeline: the extension captures the page as numbered blocks + harvested form fields; a cheap OpenRouter LLM points at content (description block range, question field IDs); values are resolved deterministically.

**Architecture:** One capture builds an addressable block index cross-referenced with the live-DOM field harvest. Backend renders the block doc as a shared cached prefix; per-task LLM calls return small strict-JSON answers (values + pointers). Deterministic post-processing slices the description verbatim, copies dropdown options verbatim from the DOM harvest, validates types against a compatibility matrix, and drops any value not present on the page. Oversized pages get an outline pre-pass.

**Tech Stack:** Vanilla-JS Chrome extension (vitest+jsdom for tests), Next.js 16 backend (`webapp/`), Zod, Prisma (`ExtractionLog` only — no schema changes), OpenRouter non-streaming client.

**Spec:** `docs/superpowers/specs/2026-07-01-indexed-extraction-design.md` — read it before starting.

## Global Constraints

- No per-site selectors/hardcoding anywhere; no JSON-LD/network reliance in this pipeline.
- No external parsing APIs (Unstructured.io/Firecrawl/context.dev). Only OpenRouter is called.
- `null` stays `null`: never guess a field; failed guards drop values, they never substitute.
- Question options are NEVER LLM-authored — always copied verbatim from the DOM harvest.
- Both task prompts must share a **byte-identical** prefix (`system` + block-doc user message) for prompt caching.
- Existing response envelopes, `normalizeExtractedFields`, `normalizeApplicationQuestions`, and the `JobApplication` save path are reused **unchanged**.
- Webapp commands run in `webapp/` (`npm run typecheck`, `npx vitest run <file>`); extension tests run in `extension/` with the local binary (`npm test` / `./node_modules/.bin/vitest run <file>`), NOT `npx vitest`.
- Extension files are classic content scripts: UMD wrapper pattern from `extension/lib/field-adapters.js:25` (`(function (root, factory) {...})(typeof self !== "undefined" ? self : globalThis, ...)`) so vitest can `import` them.
- Do not modify: `extension/parsers/clean-dom.js` beyond the one attribute listed in Task 2; `lib/llm/extraction.ts` / `application-extraction.ts` beyond re-exports (legacy paths stay live until Task 13).
- Commit after every task (message prefixes given per task).

---

### Task 1: Block emitter (`extension/parsers/block-capture.js`)

**Files:**
- Create: `extension/parsers/block-capture.js`
- Create: `extension/parsers/block-capture.test.js`
- Modify: `extension/vitest.config.js` (add `parsers/**/*.test.js` to `include`)
- Modify: `extension/manifest.json:28-40` (add `"parsers/block-capture.js"` before `"parsers/capture.js"`)

**Interfaces:**
- Consumes: nothing (pure DOM walk; runs on the cleaned clone).
- Produces (global `JobTracker.blocks`, also `module.exports` for tests):
  - `emitBlocks(rootNode, { markerFor? }) → Array<{ i: number, kind: "heading"|"para"|"li"|"row"|"field", text: string }>`
  - `legacyMarker(el) → string` (default `markerFor`)
  - `renderFieldMarker(field) → string` where `field = { id, label, kind, inputType?, options?, required?, placeholder? }`
  - `isControl(el) → boolean`
  - `BLOCK_TEXT_MAX = 2000`

- [ ] **Step 1: Write the failing tests**

Create `extension/parsers/block-capture.test.js`:

```js
// Block emitter tests — jsdom. The emitter walks an (already cleaned) DOM subtree and
// produces ordered, typed blocks. No visibility checks here (that's the harvester's job),
// so plain jsdom nodes work.
import { describe, it, expect } from "vitest";

import blocks from "./block-capture.js";

const { emitBlocks, legacyMarker, renderFieldMarker, isControl, BLOCK_TEXT_MAX } = blocks;

function domOf(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("emitBlocks", () => {
  it("emits heading, para, li and row blocks with sequential indices", () => {
    const root = domOf(`
      <h1>Senior <span>Data</span> Scientist</h1>
      <p>We are hiring.</p>
      <ul><li>Remote</li><li>Full-time</li></ul>
      <table><tr><th>Salary</th><td>$150k</td></tr></table>
    `);
    const out = emitBlocks(root);
    expect(out.map((b) => [b.kind, b.text])).toEqual([
      ["heading", "# Senior Data Scientist"],
      ["para", "We are hiring."],
      ["li", "- Remote"],
      ["li", "- Full-time"],
      ["row", "Salary | $150k"],
    ]);
    expect(out.map((b) => b.i)).toEqual([0, 1, 2, 3, 4]);
  });

  it("separates table cells (no SalaryLocation garbling)", () => {
    const root = domOf(
      "<table><tr><th>Salary</th><th>Location</th></tr><tr><td>$150k</td><td>Remote</td></tr></table>",
    );
    const out = emitBlocks(root);
    expect(out.map((b) => b.text)).toEqual(["Salary | Location", "$150k | Remote"]);
    expect(out.every((b) => b.kind === "row")).toBe(true);
  });

  it("emits field blocks for flow-level controls via markerFor and suppresses empty markers", () => {
    const root = domOf(`
      <label>Country</label>
      <select><option value="">Select…</option><option>USA</option><option>Canada</option></select>
      <input type="hidden" value="token">
    `);
    const seen = [];
    const out = emitBlocks(root, {
      markerFor: (el) => {
        seen.push(el.tagName);
        return el.tagName === "SELECT" ? '[field q1: dropdown "Country"]' : "";
      },
    });
    // hidden input consulted (counter parity) but suppressed (empty marker → no block)
    expect(seen).toEqual(["SELECT", "INPUT"]);
    expect(out.map((b) => [b.kind, b.text])).toEqual([
      ["para", "Country"],
      ["field", '[field q1: dropdown "Country"]'],
    ]);
  });

  it("keeps nested list structure as sibling li blocks", () => {
    const root = domOf(
      "<ul><li>Benefits<ul><li>Health</li><li>Dental</li></ul></li></ul>",
    );
    expect(emitBlocks(root).map((b) => b.text)).toEqual(["- Benefits", "- Health", "- Dental"]);
  });

  it("renders controls inside table cells inline through markerFor", () => {
    const root = domOf(
      "<table><tr><td>Phone</td><td><input type='tel'></td></tr></table>",
    );
    const out = emitBlocks(root, { markerFor: () => "[field q9: tel]" });
    expect(out).toEqual([{ i: 0, kind: "row", text: "Phone | [field q9: tel]" }]);
  });

  it("splits an oversized block into continuation blocks of the same kind", () => {
    const root = domOf(`<p>${"word ".repeat(1000)}</p>`); // ~5000 chars
    const out = emitBlocks(root);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((b) => b.kind === "para" && b.text.length <= BLOCK_TEXT_MAX)).toBe(true);
  });

  it("flushes paragraph text around block boundaries and drops empty blocks", () => {
    const root = domOf("<div>Intro <span>text</span><h2>Reqs</h2>tail</div>");
    expect(emitBlocks(root).map((b) => [b.kind, b.text])).toEqual([
      ["para", "Intro text"],
      ["heading", "## Reqs"],
      ["para", "tail"],
    ]);
  });
});

describe("legacyMarker", () => {
  it("keeps the old typed markers", () => {
    const sel = domOf(
      "<select><option>USA</option><option>Canada</option></select>",
    ).firstElementChild;
    expect(legacyMarker(sel)).toBe("[dropdown: USA | Canada]");
    const email = domOf('<input type="email" placeholder="you@x.com">').firstElementChild;
    expect(legacyMarker(email)).toBe("[email: you@x.com]");
    const hidden = domOf('<input type="hidden">').firstElementChild;
    expect(legacyMarker(hidden)).toBe("");
  });
});

describe("renderFieldMarker", () => {
  it("renders id, kind, label, required, options and placeholder", () => {
    expect(
      renderFieldMarker({
        id: "q7",
        label: "Country",
        kind: "select",
        options: ["United States", "Canada"],
        required: true,
      }),
    ).toBe('[field q7: dropdown "Country" (required) — options: United States | Canada]');
    expect(renderFieldMarker({ id: "q2", label: "Email", kind: "text", inputType: "email" })).toBe(
      '[field q2: email "Email"]',
    );
  });
});

describe("isControl", () => {
  it("matches inputs, textareas, selects and contenteditable", () => {
    expect(isControl(domOf("<input>").firstElementChild)).toBe(true);
    expect(isControl(domOf("<div contenteditable='true'></div>").firstElementChild)).toBe(true);
    expect(isControl(domOf("<div></div>").firstElementChild)).toBe(false);
  });
});
```

- [ ] **Step 2: Update vitest include + manifest, run tests to verify they fail**

In `extension/vitest.config.js` change:

```js
    include: ["lib/**/*.test.js", "ui/**/*.test.js"],
```

to:

```js
    include: ["lib/**/*.test.js", "ui/**/*.test.js", "parsers/**/*.test.js"],
```

In `extension/manifest.json`, in `content_scripts[0].js`, insert `"parsers/block-capture.js"` immediately before `"parsers/capture.js"`.

Run: `cd extension && ./node_modules/.bin/vitest run parsers/block-capture.test.js`
Expected: FAIL — cannot resolve `./block-capture.js`.

- [ ] **Step 3: Implement `extension/parsers/block-capture.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd extension && ./node_modules/.bin/vitest run parsers/block-capture.test.js`
Expected: PASS (all). Also run the full extension suite: `./node_modules/.bin/vitest run` — the pre-existing `field-adapters` tests must still pass.

- [ ] **Step 5: Commit**

```bash
git add extension/parsers/block-capture.js extension/parsers/block-capture.test.js extension/vitest.config.js extension/manifest.json
git commit -m "feat(extension): block emitter for indexed extraction capture"
```

---

### Task 2: Capture v2 — `scopePage({ harvest })`, control linkage, settle gate

**Files:**
- Modify: `extension/parsers/clean-dom.js:38` (KEPT_ATTRS)
- Modify: `extension/parsers/capture.js`
- Modify: `extension/ui/application.js:864-962` (`harvestQuestions` returns `controlIds`)
- Create: `extension/parsers/capture.test.js`

**Interfaces:**
- Consumes: `JobTracker.blocks` (Task 1), `JobTracker.cleanDom.cleanDom`.
- Produces:
  - `JobTracker.scope.scopePage({ harvest? })` → adds `blocks: [{i,kind,text}]` and `fields` to the existing return shape; `harvest = { fields, controlIds: WeakMap<Element,string> }`.
  - `JobTracker.scope.settle({ quietMs?, maxMs? }) → Promise<void>`.
  - `harvestQuestions()` (application.js) now returns `{ fields, total, controlIds }`.

- [ ] **Step 1: KEPT_ATTRS — one-word change**

In `extension/parsers/clean-dom.js`, add `"contenteditable"` to the `KEPT_ATTRS` set (line 38 region). Reason (add as a trailing comment): the block emitter and the live-control counter must both see contenteditable on the cleaned clone, or clone/live control order drifts.

- [ ] **Step 2: `harvestQuestions` returns the element→id map**

In `extension/ui/application.js`, inside `harvestQuestions()`:

At the top (after `let seq = 0;`):

```js
    // Element → field-id map so capture v2 can stamp the SAME q<N> ids into its block doc.
    // Group members all map to the group's one id (the block doc emits one field block per group).
    const controlIds = new WeakMap();
```

In the button-cluster loop, `controlIds` is not needed (clusters are buttons — never enumerated by the control counter); leave it.

In `emitGroup`, after `fields.push(f)` / before `inputs.forEach((i) => consumed.add(i));`, add:

```js
      inputs.forEach((i) => controlIds.set(i, f.id));
```

(Note: `emitGroup` currently builds an object literal pushed directly; give it a name first:

```js
    const emitGroup = (inputs, kind) => {
      const f = {
        id: nextQid(),
        label: groupLabel(inputs),
        kind,
        options: inputs.map((i) => optionLabel(i)).slice(0, MAX_OPTIONS),
      };
      if (inputs.some((i) => i.required)) f.required = true;
      fields.push(f);
      inputs.forEach((i) => controlIds.set(i, f.id));
      inputs.forEach((i) => consumed.add(i));
    };
```

— this is already its shape at `application.js:921-931`; only the `controlIds.set` line is new.)

In the singles loop, after `fields.push(f);` add:

```js
      controlIds.set(el, f.id);
```

Change the return to:

```js
    const cleaned = fields.filter((f) => f.label && f.label.trim()).slice(0, MAX_FIELDS);
    return { fields: cleaned, total: cleaned.length, controlIds };
```

⚠️ The `cleaned` filter drops unlabelled fields but `controlIds` may still map their elements — that's fine and REQUIRED: capture must ask "is this element harvested?" but only kept fields have descriptors. Build a `byId` map from `cleaned` in capture (Step 3); an id not in `byId` falls back to the legacy marker.

- [ ] **Step 3: Rewrite `extension/parsers/capture.js` serialization core**

Replace the `toMarkdown` + `pageMarkdown` functions (keep `hostname`, `cleanHref`, all `harvest*` signal functions, `clog`, the constants) with block-based capture, and extend `scopePage`:

```js
  // ---- capture v2: block index -------------------------------------------------------------
  // One walk produces addressable blocks (see block-capture.js); the legacy flat strings
  // (`text`/`fullText`) are DERIVED from the blocks so the old paths keep working until deleted.
  const CONTROL_SELECTOR = "input, textarea, select, [contenteditable]";

  // Build the markerFor callback for a capture pass. The block emitter walks a CLEANED CLONE,
  // so live-element identity is gone — we recover it by ORDER: the Nth control encountered in
  // the clone (pre-order) is the Nth control in the live body. clean-dom preserves every
  // control (KEEP_IF_EMPTY) and the contenteditable attribute (KEPT_ATTRS), so the two
  // sequences match. Harvested controls render the rich [field q<N>: …] marker (one per GROUP —
  // repeats suppress); everything else keeps the legacy anonymous marker.
  function makeMarkerFor(harvest) {
    const liveControls = Array.from(document.body.querySelectorAll(CONTROL_SELECTOR));
    const byId = new Map(
      ((harvest && harvest.fields) || []).map((f) => [f.id, f]),
    );
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

  function scopePage(opts) {
    const harvest = (opts && opts.harvest) || null;
    const blocks = pageBlocks(harvest);
    // Legacy flat markdown, derived from the same walk (one serialization, three consumers).
    const full = blocks.map((b) => b.text).join("\n\n").slice(0, FULL_TEXT_MAX);
    return {
      blocks,
      fields: (harvest && harvest.fields) || [],
      text: full.slice(0, TEXT_MAX),
      fullText: full,
      url: cleanHref(),
      source: hostname(),
      titleHint: (document.title || "").trim(),
      signals: harvestStructuredSignals(),
    };
  }

  NS.scope = { scopePage, harvestStructuredSignals, settle };
```

Delete the old `toMarkdown`, `pageMarkdown`, `HEADING`, `BLOCK` definitions from capture.js (they moved to block-capture.js). Keep the file-top comments; update the pipeline comment to mention blocks.

- [ ] **Step 4: Add the UMD export to capture.js and clean-dom.js for tests**

Both files end with `})(self);`. Change each closing to match the testable pattern — at the very end of `capture.js` (inside the IIFE, after `NS.scope = …`):

```js
  if (typeof module !== "undefined" && module.exports) module.exports = NS.scope;
})(typeof self !== "undefined" ? self : globalThis);
```

And at the end of `clean-dom.js` (after `NS.cleanDom = …`):

```js
  if (typeof module !== "undefined" && module.exports) module.exports = NS.cleanDom;
})(typeof self !== "undefined" ? self : globalThis);
```

- [ ] **Step 5: Write the integration tests**

Create `extension/parsers/capture.test.js`:

```js
// Capture v2 integration — jsdom. Verifies the live-control ↔ clone-control ORDER linkage
// (the mechanism that lets field blocks carry harvested q<N> ids across the cleanDom clone)
// and the settle gate's timing behaviour.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import "./clean-dom.js";
import "./block-capture.js";
import scope from "./capture.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("scopePage with harvest linkage", () => {
  it("stamps harvested ids into field blocks, one per group, legacy marker otherwise", () => {
    document.body.innerHTML = `
      <h1>Intern</h1>
      <input type="search" placeholder="Search jobs">
      <label>Full name</label><input type="text" id="nm">
      <fieldset><legend>Authorized?</legend>
        <input type="radio" name="auth" value="Yes"><input type="radio" name="auth" value="No">
      </fieldset>
    `;
    const nm = document.getElementById("nm");
    const radios = Array.from(document.querySelectorAll('input[name="auth"]'));
    const controlIds = new WeakMap();
    controlIds.set(nm, "q1");
    radios.forEach((r) => controlIds.set(r, "q2"));
    const harvest = {
      controlIds,
      fields: [
        { id: "q1", label: "Full name", kind: "text", required: false },
        { id: "q2", label: "Authorized?", kind: "radio", options: ["Yes", "No"] },
      ],
    };
    const scoped = scope.scopePage({ harvest });
    const fieldBlocks = scoped.blocks.filter((b) => b.kind === "field");
    expect(fieldBlocks.map((b) => b.text)).toEqual([
      "[search: Search jobs]", // un-harvested → legacy marker
      '[field q1: text "Full name"]',
      '[field q2: single choice "Authorized?" — options: Yes | No]', // ONE block for the group
    ]);
    expect(scoped.fields).toEqual(harvest.fields);
    // legacy strings still derived
    expect(scoped.fullText).toContain("# Intern");
  });

  it("works with no harvest (legacy markers everywhere)", () => {
    document.body.innerHTML = `<textarea placeholder="Cover letter"></textarea>`;
    const scoped = scope.scopePage();
    expect(scoped.blocks.some((b) => b.text === "[long text: Cover letter]")).toBe(true);
    expect(scoped.fields).toEqual([]);
  });
});

describe("settle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves after quietMs when the DOM is quiet", async () => {
    const p = scope.settle({ quietMs: 300, maxMs: 2500 });
    let settled = false;
    p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(299);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toBe(true);
  });

  it("caps at maxMs under continuous mutations", async () => {
    const p = scope.settle({ quietMs: 300, maxMs: 1000 });
    let settled = false;
    p.then(() => (settled = true));
    const churn = setInterval(() => {
      document.body.append(document.createElement("i"));
    }, 100);
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toBe(true);
    clearInterval(churn);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd extension && ./node_modules/.bin/vitest run`
Expected: PASS (block-capture, capture, field-adapters).
Note: jsdom's `document.readyState` is `"complete"` by default under vitest, which the first settle test relies on.

- [ ] **Step 7: Commit**

```bash
git add extension/parsers/capture.js extension/parsers/capture.test.js extension/parsers/clean-dom.js extension/ui/application.js
git commit -m "feat(extension): capture v2 — block index, harvest linkage, settle gate"
```

---

### Task 3: Backend config + OpenRouter `response_format`

**Files:**
- Modify: `webapp/lib/env.ts` (after the `AI_DRAFT_*` block, ~line 68)
- Modify: `webapp/lib/llm/openrouter.ts`

**Interfaces:**
- Produces: `env.EXTRACTION_MODEL: string`, `env.EXTRACTION_FALLBACK_MODELS: string`, `env.INDEXED_TOKEN_BUDGET: number`; `OpenRouterChatOptions.responseFormat?: Record<string, unknown>`.

- [ ] **Step 1: env additions**

In `webapp/lib/env.ts` after the `AI_DRAFT_MAX_TOKENS` line add:

```ts
  // OpenRouter also powers INDEXED extraction (POST /api/extract/indexed +
  // /api/extract-application/indexed) — the block-addressed pipeline (see
  // docs/superpowers/specs/2026-07-01-indexed-extraction-design.md). The LLM points at
  // content (block ranges / field ids); values are resolved deterministically, so output
  // stays tiny and a fast cheap model fits. Server-side ONLY.
  //   EXTRACTION_MODEL           — primary model slug.
  //   EXTRACTION_FALLBACK_MODELS — comma-separated fallbacks, in order.
  //   INDEXED_TOKEN_BUDGET       — est. input tokens above which the outline pre-pass runs.
  EXTRACTION_MODEL: z.string().default("google/gemini-3.5-flash"),
  EXTRACTION_FALLBACK_MODELS: z
    .string()
    .default("google/gemini-3.1-flash-lite,z-ai/glm-4.7-flash"),
  INDEXED_TOKEN_BUDGET: z.coerce.number().int().min(2000).max(200_000).default(24_000),
```

- [ ] **Step 2: openrouter.ts `responseFormat` passthrough**

In `OpenRouterChatOptions` add:

```ts
  /** OpenAI-compatible response_format (e.g. json_schema). Passed through verbatim. */
  responseFormat?: Record<string, unknown>
```

In the `payload` object inside `openRouterChat`, after `max_tokens`:

```ts
    ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
```

- [ ] **Step 3: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add webapp/lib/env.ts webapp/lib/llm/openrouter.ts
git commit -m "feat(webapp): extraction model config + OpenRouter response_format passthrough"
```

---

### Task 4: `lib/llm/indexed-shared.ts` — block doc, shared prefix, outline

**Files:**
- Create: `webapp/lib/llm/indexed-shared.ts`
- Create: `webapp/lib/llm/indexed-shared.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type CapturedBlock = { i: number; kind: "heading" | "para" | "li" | "row" | "field"; text: string }`
  - `type HarvestedField = { id: string; label: string; kind: string; inputType?: string; options?: string[]; required?: boolean; placeholder?: string }`
  - `INDEXED_SYSTEM: string`
  - `renderBlockDoc(blocks: CapturedBlock[]): string` — `B<i>| <text>` lines
  - `pagePrefixMessages(blocks): LlmMessage[]` — the byte-identical cached prefix (system + block doc user msg, both `cache: true`)
  - `estimateTokens(blocks): number`
  - `renderOutline(blocks): string`
  - `buildOutlineMessages(blocks, task: "details" | "questions"): LlmMessage[]`
  - `parseOutlineRegions(raw: unknown, blockCount: number): Array<{ start: number; end: number }> | null`
  - `sliceRegions(blocks, regions): CapturedBlock[]` — regions ∪ first 40 blocks ∪ all `field` blocks, original order, deduped
  - `asObject(raw: unknown): Record<string, unknown> | null` — re-export of the tolerant parser (import it from `@/lib/llm/extraction`? It is not exported there — define it here and export; Tasks 5/6 import from here.)

- [ ] **Step 1: Write the failing tests**

Create `webapp/lib/llm/indexed-shared.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  buildOutlineMessages,
  estimateTokens,
  pagePrefixMessages,
  parseOutlineRegions,
  renderBlockDoc,
  renderOutline,
  sliceRegions,
  type CapturedBlock,
} from "@/lib/llm/indexed-shared"

const B = (i: number, kind: CapturedBlock["kind"], text: string): CapturedBlock => ({ i, kind, text })

describe("renderBlockDoc", () => {
  it("renders numbered lines keyed by block index", () => {
    expect(renderBlockDoc([B(0, "heading", "# Role"), B(1, "para", "Great job.")])).toBe(
      "B0| # Role\nB1| Great job.",
    )
  })
})

describe("pagePrefixMessages", () => {
  it("is byte-identical for the same blocks and marks both messages cacheable", () => {
    const blocks = [B(0, "para", "hello")]
    const a = pagePrefixMessages(blocks)
    const b = pagePrefixMessages(blocks)
    expect(a).toEqual(b)
    expect(a).toHaveLength(2)
    expect(a[0].role).toBe("system")
    expect(a.every((m) => m.cache)).toBe(true)
  })
})

describe("estimateTokens", () => {
  it("approximates chars/4 plus numbering overhead", () => {
    const blocks = [B(0, "para", "x".repeat(400))]
    const est = estimateTokens(blocks)
    expect(est).toBeGreaterThanOrEqual(100)
    expect(est).toBeLessThan(120)
  })
})

describe("renderOutline", () => {
  it("keeps headings and field blocks whole, truncates prose to 80 chars", () => {
    const blocks = [
      B(0, "heading", "## About"),
      B(1, "para", "p".repeat(200)),
      B(2, "field", '[field q1: text "Name"]'),
    ]
    const out = renderOutline(blocks)
    expect(out).toContain("B0| ## About")
    expect(out).toContain(`B1| ${"p".repeat(80)}…`)
    expect(out).toContain('B2| [field q1: text "Name"]')
  })
})

describe("parseOutlineRegions", () => {
  it("accepts valid regions and clamps to block count", () => {
    expect(parseOutlineRegions({ regions: [{ start: 2, end: 900 }] }, 10)).toEqual([
      { start: 2, end: 9 },
    ])
  })
  it("rejects malformed payloads", () => {
    expect(parseOutlineRegions({ regions: [{ start: 5, end: 2 }] }, 10)).toBeNull()
    expect(parseOutlineRegions({}, 10)).toBeNull()
    expect(parseOutlineRegions("nonsense", 10)).toBeNull()
  })
})

describe("sliceRegions", () => {
  it("keeps the region, the first 40 blocks, and every field block, in order without dupes", () => {
    const blocks: CapturedBlock[] = []
    for (let i = 0; i < 120; i++) {
      blocks.push(B(i, i === 100 ? "field" : "para", `t${i}`))
    }
    const kept = sliceRegions(blocks, [{ start: 60, end: 62 }])
    const ids = kept.map((b) => b.i)
    expect(ids.slice(0, 40)).toEqual([...Array(40).keys()]) // first-40 rule
    expect(ids).toContain(60)
    expect(ids).toContain(61)
    expect(ids).toContain(62)
    expect(ids).toContain(100) // field block always kept
    expect(new Set(ids).size).toBe(ids.length) // no dupes
    expect(ids).toEqual([...ids].sort((a, b) => a - b)) // original order
  })
})

describe("buildOutlineMessages", () => {
  it("mentions the task and asks for JSON regions", () => {
    const msgs = buildOutlineMessages([B(0, "para", "x")], "details")
    const text = msgs.map((m) => m.content).join("\n")
    expect(text).toContain("B0| x")
    expect(text).toContain('"regions"')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd webapp && npx vitest run lib/llm/indexed-shared.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `webapp/lib/llm/indexed-shared.ts`**

```ts
/**
 * Indexed extraction — shared, pure primitives (no I/O).
 *
 * The extension captures the page as ordered, typed BLOCKS (see extension/parsers/
 * block-capture.js) plus the harvested form fields. This module renders those blocks as the
 * numbered document both tasks share ("B12| …"), so the model can answer with block indices
 * and field ids instead of regenerating content. The rendered prefix must stay BYTE-IDENTICAL
 * between the details and questions prompts — it is the prompt-cache key.
 */

import type { LlmMessage } from "@/lib/llm/openrouter"

export type CapturedBlock = {
  i: number
  kind: "heading" | "para" | "li" | "row" | "field"
  text: string
}

export type HarvestedField = {
  id: string
  label: string
  kind: string
  inputType?: string
  options?: string[]
  required?: boolean
  placeholder?: string
}

/** Shared system prompt — the cached prefix's first component. Keep identical across tasks. */
export const INDEXED_SYSTEM =
  "You read one job posting web page, given as numbered blocks (B<n>| text) converted from the " +
  "rendered page: headings, paragraphs, list items, table rows, and form controls encoded as " +
  "[field q<n>: …] markers. The page may include site navigation and boilerplate. You answer " +
  "by POINTING at the page — block index ranges and field ids — plus short verbatim values. " +
  "Use only what the input actually states: never guess, infer, or invent. For anything " +
  "genuinely not present, use null. Output JSON only, no prose."

export function renderBlockDoc(blocks: CapturedBlock[]): string {
  return blocks.map((b) => `B${b.i}| ${b.text}`).join("\n")
}

/** The byte-identical cached prefix: system + the block doc. Both marked cacheable. */
export function pagePrefixMessages(blocks: CapturedBlock[]): LlmMessage[] {
  return [
    { role: "system", content: INDEXED_SYSTEM, cache: true },
    {
      role: "user",
      content: 'Job posting page as numbered blocks:\n"""\n' + renderBlockDoc(blocks) + '\n"""',
      cache: true,
    },
  ]
}

/** Rough input-token estimate (chars/4) including the B<n>| numbering overhead. */
export function estimateTokens(blocks: CapturedBlock[]): number {
  const chars = blocks.reduce((n, b) => n + b.text.length + 6, 0)
  return Math.ceil(chars / 4)
}

// ---- outline pre-pass (oversized pages only) -------------------------------------------------

const OUTLINE_SNIPPET = 80

/** Compressed skeleton: headings + field blocks whole; other blocks truncated to 80 chars. */
export function renderOutline(blocks: CapturedBlock[]): string {
  return blocks
    .map((b) => {
      const text =
        b.kind === "heading" || b.kind === "field"
          ? b.text
          : b.text.length > OUTLINE_SNIPPET
            ? b.text.slice(0, OUTLINE_SNIPPET) + "…"
            : b.text
      return `B${b.i}| ${text}`
    })
    .join("\n")
}

export function buildOutlineMessages(
  blocks: CapturedBlock[],
  task: "details" | "questions",
): LlmMessage[] {
  const goal =
    task === "details"
      ? "the job posting's details: title, company, location, salary, employment/workplace type, and the FULL job description body"
      : "the application form a candidate must fill in (all its fields and their surrounding labels/help text)"
  return [
    { role: "system", content: INDEXED_SYSTEM },
    {
      role: "user",
      content:
        'Outline of a job posting page (blocks truncated):\n"""\n' +
        renderOutline(blocks) +
        '\n"""\n\nIdentify every region of this page that contains ' +
        goal +
        '. Respond with JSON only: {"regions":[{"start":<first block index>,"end":<last block index>}]} ' +
        "— generous ranges are fine; missing content is worse than extra.",
    },
  ]
}

/** Validate the outline reply. Returns clamped regions, or null when unusable. */
export function parseOutlineRegions(
  raw: unknown,
  blockCount: number,
): Array<{ start: number; end: number }> | null {
  const obj = asObject(raw)
  if (!obj || !Array.isArray(obj.regions) || obj.regions.length === 0) return null
  const out: Array<{ start: number; end: number }> = []
  for (const r of obj.regions) {
    if (!r || typeof r !== "object") return null
    const start = Math.max(0, Math.trunc(Number((r as Record<string, unknown>).start)))
    const end = Math.min(blockCount - 1, Math.trunc(Number((r as Record<string, unknown>).end)))
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null
    out.push({ start, end })
  }
  return out
}

const ALWAYS_KEEP_FIRST = 40

/** Keep regions ∪ the first 40 blocks ∪ every field block — original order, no dupes. */
export function sliceRegions(
  blocks: CapturedBlock[],
  regions: Array<{ start: number; end: number }>,
): CapturedBlock[] {
  const keep = new Set<number>()
  for (let i = 0; i < Math.min(ALWAYS_KEEP_FIRST, blocks.length); i++) keep.add(blocks[i].i)
  for (const b of blocks) if (b.kind === "field") keep.add(b.i)
  for (const r of regions) for (let i = r.start; i <= r.end; i++) keep.add(i)
  return blocks.filter((b) => keep.has(b.i))
}

/** Tolerant JSON-object reader (same behaviour as extraction.ts's private helper). */
export function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw !== "string") return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      const parsed = JSON.parse(m[0])
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd webapp && npx vitest run lib/llm/indexed-shared.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/lib/llm/indexed-shared.ts webapp/lib/llm/indexed-shared.test.ts
git commit -m "feat(webapp): indexed-extraction shared primitives (block doc, outline, prefix)"
```

---

### Task 5: `lib/llm/indexed-details.ts` — details prompt + deterministic resolution

**Files:**
- Create: `webapp/lib/llm/indexed-details.ts`
- Create: `webapp/lib/llm/indexed-details.test.ts`

**Interfaces:**
- Consumes: `pagePrefixMessages`, `asObject`, `CapturedBlock` from `@/lib/llm/indexed-shared`; `normalizeExtractedFields`, `type ExtractedJob` from `@/lib/llm/extraction`; `LlmMessage` from `@/lib/llm/openrouter`.
- Produces:
  - `buildIndexedDetailsMessages(blocks): LlmMessage[]`
  - `DETAILS_RESPONSE_FORMAT: Record<string, unknown>` (json_schema)
  - `resolveIndexedDetails(raw: unknown, blocks: CapturedBlock[], titleHint?: string): { fields: ExtractedJob; description?: string; detected: { hasJobDetails: boolean; hasApplicationForm: boolean } }`
  - `renderDescription(blocks, range: { start: number; end: number; exclude?: number[] }): string | null`
  - `containsOnPage(value: string, haystack: string): boolean` (exported for tests)

- [ ] **Step 1: Write the failing tests**

Create `webapp/lib/llm/indexed-details.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  buildIndexedDetailsMessages,
  containsOnPage,
  renderDescription,
  resolveIndexedDetails,
} from "@/lib/llm/indexed-details"
import { pagePrefixMessages, type CapturedBlock } from "@/lib/llm/indexed-shared"

const B = (i: number, kind: CapturedBlock["kind"], text: string): CapturedBlock => ({ i, kind, text })

const PAGE: CapturedBlock[] = [
  B(0, "heading", "# Software Engineering Intern"),
  B(1, "para", "Acme Robotics · Remote — Ontario, Canada"),
  B(2, "heading", "## About the role"),
  B(3, "para", "Build robots that build robots."),
  B(4, "li", "- Ship weekly"),
  B(5, "field", '[field q1: text "Full name"]'),
  B(6, "para", "Salary: CAD $60,000 - $75,000 per year"),
]

describe("buildIndexedDetailsMessages", () => {
  it("starts with the byte-identical cached page prefix", () => {
    const msgs = buildIndexedDetailsMessages(PAGE)
    expect(msgs.slice(0, 2)).toEqual(pagePrefixMessages(PAGE))
    expect(msgs).toHaveLength(3)
    expect(msgs[2].cache).toBeUndefined()
  })
})

describe("containsOnPage", () => {
  it("is case/whitespace/punctuation/unicode-dash insensitive", () => {
    const hay = "Remote — Ontario,  Canada"
    expect(containsOnPage("remote - ontario canada", hay)).toBe(true)
    expect(containsOnPage("Berlin", hay)).toBe(false)
  })
  it("rejects empty normalizations rather than trivially matching", () => {
    expect(containsOnPage("—", "anything")).toBe(false)
  })
})

describe("renderDescription", () => {
  it("slices verbatim, skips excluded and field blocks, keeps markdown shape", () => {
    const out = renderDescription(PAGE, { start: 2, end: 6, exclude: [6] })
    expect(out).toBe("## About the role\n\nBuild robots that build robots.\n- Ship weekly")
  })
  it("returns null on invalid ranges", () => {
    expect(renderDescription(PAGE, { start: 5, end: 2 })).toBeNull()
    expect(renderDescription(PAGE, { start: 0, end: 999 })).toBeNull()
    expect(renderDescription(PAGE, { start: -1, end: 2 })).toBeNull()
  })
  it("returns null when the slice is only field blocks", () => {
    expect(renderDescription(PAGE, { start: 5, end: 5 })).toBeNull()
  })
})

describe("resolveIndexedDetails", () => {
  const good = {
    title: "Software Engineering Intern",
    company: "Acme Robotics",
    location: "Remote — Ontario, Canada",
    salary: "CAD $60,000 - $75,000 per year",
    employmentType: "Internship",
    workplaceType: "Remote",
    descriptionRange: { start: 2, end: 4, exclude: [] },
    hasJobDetails: true,
    hasApplicationForm: true,
  }

  it("keeps values present on the page and slices the description", () => {
    const r = resolveIndexedDetails(good, PAGE)
    expect(r.fields.title).toBe("Software Engineering Intern")
    expect(r.fields.company).toBe("Acme Robotics")
    expect(r.fields.salary).toBe("CAD $60,000 - $75,000 per year")
    expect(r.description).toContain("Build robots")
    expect(r.detected).toEqual({ hasJobDetails: true, hasApplicationForm: true })
  })

  it("drops hallucinated values (not present on the page)", () => {
    const r = resolveIndexedDetails({ ...good, company: "Globex" }, PAGE)
    expect(r.fields.company).toBeUndefined()
  })

  it("drops invalid enums and invalid ranges without guessing", () => {
    const r = resolveIndexedDetails(
      { ...good, employmentType: "Gig", descriptionRange: { start: 9, end: 1 } },
      PAGE,
    )
    expect(r.fields.employmentType).toBeUndefined()
    expect(r.description).toBeUndefined()
  })

  it("null stays null; sentinel strings dropped by the existing sieve", () => {
    const r = resolveIndexedDetails(
      { ...good, salary: null, location: "N/A", descriptionRange: null },
      PAGE,
    )
    expect(r.fields.salary).toBeUndefined()
    expect(r.fields.location).toBeUndefined()
    expect(r.description).toBeUndefined()
  })

  it("accepts a title present only in the titleHint", () => {
    const r = resolveIndexedDetails(
      { ...good, title: "Intern - Acme Careers" },
      PAGE,
      "Intern - Acme Careers | Acme Robotics",
    )
    expect(r.fields.title).toBe("Intern - Acme Careers")
  })

  it("tolerates a fenced-JSON string reply", () => {
    const r = resolveIndexedDetails("```json\n" + JSON.stringify(good) + "\n```", PAGE)
    expect(r.fields.title).toBe("Software Engineering Intern")
  })

  it("returns empty result shape when the reply is unusable", () => {
    const r = resolveIndexedDetails("total garbage", PAGE)
    expect(r.fields).toEqual({})
    expect(r.description).toBeUndefined()
    expect(r.detected).toEqual({ hasJobDetails: false, hasApplicationForm: false })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd webapp && npx vitest run lib/llm/indexed-details.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `webapp/lib/llm/indexed-details.ts`**

```ts
/**
 * Indexed job-details extraction — prompt + deterministic resolution (pure, no I/O).
 *
 * The model reads the numbered block doc and answers with SMALL values plus a
 * descriptionRange POINTER; the description text itself is sliced verbatim from the blocks
 * here, so it cannot be truncated mid-sentence or hallucinated, and output stays ~100 tokens
 * regardless of page size. Small fields pass a normalized containment check against the page
 * text — a value that does not appear on the page is treated as hallucination and dropped.
 */

import { normalizeExtractedFields, type ExtractedJob } from "@/lib/llm/extraction"
import {
  asObject,
  pagePrefixMessages,
  type CapturedBlock,
} from "@/lib/llm/indexed-shared"
import type { LlmMessage } from "@/lib/llm/openrouter"

export type Detected = { hasJobDetails: boolean; hasApplicationForm: boolean }

export type IndexedDetailsResult = {
  fields: ExtractedJob
  description?: string
  detected: Detected
}

const EMPLOYMENT_TYPES = new Set([
  "Full-time", "Part-time", "Contract", "Internship", "Temporary", "Freelance",
  "Volunteer", "Apprenticeship",
])
const WORKPLACE_TYPES = new Set(["Remote", "Hybrid", "On-site"])

const DETAILS_TASK = [
  "From the page above, extract:",
  '- title: the role title only (e.g. "Senior Backend Engineer"). It may appear without any label — read the page text.',
  "- company: the hiring company's name only (often in the header, logo alt text, or page title).",
  '- location: where the role is based, as stated (e.g. "Remote", "London (Hybrid)").',
  "- salary: the pay EXACTLY as written, with currency and period — never convert or estimate.",
  "- employmentType: one of Full-time, Part-time, Contract, Internship, Temporary, Freelance, Volunteer, Apprenticeship — or null.",
  "- workplaceType: one of Remote, Hybrid, On-site — or null.",
  "- descriptionRange: the CONTIGUOUS block range holding the job description body (about the role," +
    " responsibilities, requirements, benefits) — {start, end, exclude} where exclude lists block" +
    " indices inside the range that are NOT description (ads, unrelated links). Choose the widest" +
    " honest range; do NOT include site navigation, the application form, or footer boilerplate." +
    " null if the page has no description.",
  "- hasJobDetails: does this page show a job posting's details?",
  "- hasApplicationForm: does this page show an application form a candidate fills in?",
  "Every string value must be copied verbatim from the page (or the page title). Use null when absent.",
].join("\n")

export function buildIndexedDetailsMessages(blocks: CapturedBlock[]): LlmMessage[] {
  return [...pagePrefixMessages(blocks), { role: "user", content: DETAILS_TASK }]
}

/** Strict schema — providers that support json_schema enforce it; others fall back to parsing. */
export const DETAILS_RESPONSE_FORMAT: Record<string, unknown> = {
  type: "json_schema",
  json_schema: {
    name: "job_details",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: ["string", "null"] },
        company: { type: ["string", "null"] },
        location: { type: ["string", "null"] },
        salary: { type: ["string", "null"] },
        employmentType: { type: ["string", "null"] },
        workplaceType: { type: ["string", "null"] },
        descriptionRange: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            start: { type: "integer" },
            end: { type: "integer" },
            exclude: { type: "array", items: { type: "integer" } },
          },
          required: ["start", "end", "exclude"],
        },
        hasJobDetails: { type: "boolean" },
        hasApplicationForm: { type: "boolean" },
      },
      required: [
        "title", "company", "location", "salary", "employmentType", "workplaceType",
        "descriptionRange", "hasJobDetails", "hasApplicationForm",
      ],
    },
  },
}

/** Case/whitespace/punctuation/unicode-insensitive containment. Empty normalization = no match. */
export function containsOnPage(value: string, haystack: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "")
  const v = norm(value)
  if (!v) return false
  return norm(haystack).includes(v)
}

/** Verbatim description slice: range minus excludes minus field blocks, markdown-shaped. */
export function renderDescription(
  blocks: CapturedBlock[],
  range: { start: number; end: number; exclude?: number[] },
): string | null {
  const start = Math.trunc(Number(range?.start))
  const end = Math.trunc(Number(range?.end))
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || end >= blocks.length || start > end) return null
  const exclude = new Set((range.exclude || []).map((n) => Math.trunc(Number(n))))
  const parts: string[] = []
  for (const b of blocks) {
    if (b.i < start || b.i > end) continue
    if (exclude.has(b.i) || b.kind === "field") continue
    if (b.kind === "heading" || b.kind === "para") parts.push("\n\n" + b.text)
    else parts.push("\n" + b.text) // li / row stay line-per-item
  }
  const out = parts.join("").replace(/\n{3,}/g, "\n\n").trim()
  return out || null
}

export function resolveIndexedDetails(
  raw: unknown,
  blocks: CapturedBlock[],
  titleHint?: string,
): IndexedDetailsResult {
  const obj = asObject(raw)
  if (!obj) {
    return { fields: {}, detected: { hasJobDetails: false, hasApplicationForm: false } }
  }

  const pageText =
    blocks.map((b) => b.text).join("\n") + (titleHint ? "\n" + titleHint : "")

  const candidate: Record<string, unknown> = {}
  for (const key of ["title", "company", "location", "salary"] as const) {
    const v = obj[key]
    if (typeof v === "string" && v.trim() && containsOnPage(v, pageText)) {
      candidate[key] = v
    }
  }
  const et = obj.employmentType
  if (typeof et === "string" && EMPLOYMENT_TYPES.has(et.trim())) candidate.employmentType = et.trim()
  const wt = obj.workplaceType
  if (typeof wt === "string" && WORKPLACE_TYPES.has(wt.trim())) candidate.workplaceType = wt.trim()

  // The existing sieve still runs (trim, sentinel strings like "N/A" dropped).
  const fields = normalizeExtractedFields(candidate)

  let description: string | undefined
  const range = obj.descriptionRange
  if (range && typeof range === "object" && !Array.isArray(range)) {
    description =
      renderDescription(blocks, range as { start: number; end: number; exclude?: number[] }) ??
      undefined
  }

  return {
    fields,
    description,
    detected: {
      hasJobDetails: obj.hasJobDetails === true,
      hasApplicationForm: obj.hasApplicationForm === true,
    },
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd webapp && npx vitest run lib/llm/indexed-details.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/lib/llm/indexed-details.ts webapp/lib/llm/indexed-details.test.ts
git commit -m "feat(webapp): indexed details prompt + verbatim-slice resolution"
```

---

### Task 6: `lib/llm/indexed-questions.ts` — classification merge, type matrix, consent filter

**Files:**
- Create: `webapp/lib/llm/indexed-questions.ts`
- Create: `webapp/lib/llm/indexed-questions.test.ts`

**Interfaces:**
- Consumes: `pagePrefixMessages`, `asObject`, `CapturedBlock`, `HarvestedField` from `@/lib/llm/indexed-shared`; `APPLICATION_FIELD_TYPES`, `normalizeApplicationQuestions`, `type ApplicationQuestion`, `type ApplicationFieldType` from `@/lib/llm/application-extraction`; `Detected` from `@/lib/llm/indexed-details`.
- Produces:
  - `buildIndexedQuestionsMessages(blocks, fields): LlmMessage[]`
  - `QUESTIONS_RESPONSE_FORMAT: Record<string, unknown>`
  - `resolveIndexedQuestions(raw: unknown, fields: HarvestedField[]): { questions: ApplicationQuestion[]; detected: Detected }`
  - `domDefaultType(f: HarvestedField): ApplicationFieldType` (exported for tests)
  - `isConsentNoise(label: string): boolean` (exported for tests)

- [ ] **Step 1: Write the failing tests**

Create `webapp/lib/llm/indexed-questions.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  buildIndexedQuestionsMessages,
  domDefaultType,
  isConsentNoise,
  resolveIndexedQuestions,
} from "@/lib/llm/indexed-questions"
import { pagePrefixMessages, type HarvestedField } from "@/lib/llm/indexed-shared"

const FIELDS: HarvestedField[] = [
  { id: "q1", label: "Full name", kind: "text", required: true },
  { id: "q2", label: "Country of residence", kind: "select", options: ["United States", "Canada"] },
  { id: "q3", label: "Are you authorized to work?", kind: "radio", options: ["Yes", "No"] },
  { id: "q4", label: "Why us?", kind: "textarea" },
  { id: "q5", label: "Resume", kind: "file", required: true },
  { id: "q6", label: "I agree to the privacy policy", kind: "checkbox" },
  { id: "q7", label: "Search jobs", kind: "text" },
  { id: "q8", label: "Years of React experience", kind: "text", inputType: "text" },
  { id: "q9", label: "Preferred locations", kind: "checkbox", options: ["Remote", "Hybrid", "On-site"] },
]

const decision = (fieldId: string, extra: Record<string, unknown> = {}) => ({
  fieldId,
  include: true,
  label: FIELDS.find((f) => f.id === fieldId)!.label,
  type: "short_text",
  ...extra,
})

describe("domDefaultType", () => {
  it("maps DOM kinds and native input types", () => {
    expect(domDefaultType({ id: "x", label: "", kind: "select" })).toBe("select")
    expect(domDefaultType({ id: "x", label: "", kind: "textarea" })).toBe("long_text")
    expect(domDefaultType({ id: "x", label: "", kind: "file" })).toBe("file")
    expect(domDefaultType({ id: "x", label: "", kind: "text", inputType: "email" })).toBe("email")
    expect(domDefaultType({ id: "x", label: "", kind: "combobox" })).toBe("select")
    expect(domDefaultType({ id: "x", label: "", kind: "contenteditable" })).toBe("long_text")
  })
})

describe("isConsentNoise", () => {
  it("flags privacy/terms/gdpr/newsletter labels", () => {
    expect(isConsentNoise("I agree to the privacy policy")).toBe(true)
    expect(isConsentNoise("I accept the Terms of Service")).toBe(true)
    expect(isConsentNoise("Subscribe to our newsletter")).toBe(true)
    expect(isConsentNoise("I consent to my data being processed")).toBe(true)
    expect(isConsentNoise("Do you consent to a background check?")).toBe(true)
    expect(isConsentNoise("Preferred locations")).toBe(false)
  })
})

describe("buildIndexedQuestionsMessages", () => {
  it("shares the byte-identical page prefix and lists the field manifest", () => {
    const blocks = [{ i: 0, kind: "para" as const, text: "Apply below" }]
    const msgs = buildIndexedQuestionsMessages(blocks, FIELDS)
    expect(msgs.slice(0, 2)).toEqual(pagePrefixMessages(blocks))
    expect(msgs[2].content).toContain("q2")
    expect(msgs[2].content).toContain("Country of residence")
  })
})

describe("resolveIndexedQuestions", () => {
  it("keeps included fields, copies options verbatim from the harvest, DOM order", () => {
    const raw = {
      hasApplicationForm: true,
      questions: [
        decision("q3", { type: "radio" }),
        decision("q1", { type: "short_text" }),
        decision("q2", { type: "select", label: "Country" }),
      ],
    }
    const { questions } = resolveIndexedQuestions(raw, FIELDS)
    expect(questions.map((q) => q.label)).toEqual([
      "Full name", "Country", "Are you authorized to work?",
    ]) // re-sorted to DOM (harvest) order
    expect(questions[1].options).toEqual(["United States", "Canada"]) // verbatim, never LLM-authored
    expect(questions[2].options).toEqual(["Yes", "No"])
  })

  it("rejects unknown fieldIds and snaps incompatible types to the DOM default", () => {
    const raw = {
      hasApplicationForm: true,
      questions: [
        decision("q999"),
        decision("q2", { type: "long_text" }), // select can't be long_text → snaps to select
        decision("q4", { type: "short_text" }), // textarea → long_text
        decision("q9", { type: "multi_select" }), // checkbox GROUP → multi_select allowed
      ],
    }
    const { questions } = resolveIndexedQuestions(raw, FIELDS)
    expect(questions.map((q) => [q.label, q.type])).toEqual([
      ["Country of residence", "select"],
      ["Why us?", "long_text"],
      ["Preferred locations", "multi_select"],
    ])
  })

  it("native input types win outright over the LLM", () => {
    const fields: HarvestedField[] = [
      { id: "q1", label: "Work email", kind: "text", inputType: "email" },
    ]
    const raw = {
      hasApplicationForm: true,
      questions: [{ fieldId: "q1", include: true, label: "Work email", type: "short_text" }],
    }
    expect(resolveIndexedQuestions(raw, fields).questions[0].type).toBe("email")
  })

  it("LLM may refine a bare text input (e.g. to number)", () => {
    const raw = {
      hasApplicationForm: true,
      questions: [decision("q8", { type: "number" })],
    }
    expect(resolveIndexedQuestions(raw, FIELDS).questions[0].type).toBe("number")
  })

  it("drops consent-noise checkboxes even if the LLM includes them", () => {
    const raw = { hasApplicationForm: true, questions: [decision("q6", { type: "checkbox" })] }
    expect(resolveIndexedQuestions(raw, FIELDS).questions).toEqual([])
  })

  it("keeps a consent-worded RADIO (background check) — filter is checkbox-only", () => {
    const fields: HarvestedField[] = [
      { id: "q1", label: "Do you consent to a background check?", kind: "radio", options: ["Yes", "No"] },
    ]
    const raw = {
      hasApplicationForm: true,
      questions: [
        { fieldId: "q1", include: true, label: "Do you consent to a background check?", type: "radio" },
      ],
    }
    expect(resolveIndexedQuestions(raw, fields).questions).toHaveLength(1)
  })

  it("DOM required:true is never un-set; LLM may set required the DOM missed", () => {
    const raw = {
      hasApplicationForm: true,
      questions: [
        decision("q1", { required: false }), // DOM says required → stays required
        decision("q4", { type: "long_text", required: true }), // DOM silent → LLM upgrades
      ],
    }
    const { questions } = resolveIndexedQuestions(raw, FIELDS)
    expect(questions[0].required).toBe(true)
    expect(questions[1].required).toBe(true)
  })

  it("passes placeholder from the harvest and helpText from the LLM", () => {
    const fields: HarvestedField[] = [
      { id: "q1", label: "LinkedIn", kind: "text", inputType: "url", placeholder: "https://linkedin.com/in/…" },
    ]
    const raw = {
      hasApplicationForm: true,
      questions: [
        { fieldId: "q1", include: true, label: "LinkedIn", type: "url", helpText: "Public profile" },
      ],
    }
    const q = resolveIndexedQuestions(raw, fields).questions[0]
    expect(q.placeholder).toBe("https://linkedin.com/in/…")
    expect(q.helpText).toBe("Public profile")
  })

  it("include:false and unusable replies yield no questions", () => {
    expect(
      resolveIndexedQuestions(
        { hasApplicationForm: false, questions: [decision("q1", { include: false })] },
        FIELDS,
      ).questions,
    ).toEqual([])
    expect(resolveIndexedQuestions("garbage", FIELDS).questions).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd webapp && npx vitest run lib/llm/indexed-questions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `webapp/lib/llm/indexed-questions.ts`**

```ts
/**
 * Indexed application-question extraction — classification merge (pure, no I/O).
 *
 * The LLM NEVER invents a question. It receives the page block doc plus the harvested field
 * manifest (real DOM controls with stable ids) and returns per-field DECISIONS: include?,
 * cleaned label, one of the 12 types, required?, helpText?. Everything authoritative comes
 * from the DOM harvest: options are copied verbatim by fieldId (they are not even in the LLM
 * output schema), placeholders come from the DOM, a DOM required:true can't be un-set, and a
 * type incompatible with the control's DOM kind snaps back to the DOM-derived default.
 * Consent/legal checkboxes (privacy policy, terms, marketing) are excluded — by prompt AND by
 * a deterministic keyword backstop, applied to checkbox-type questions only.
 */

import {
  APPLICATION_FIELD_TYPES,
  normalizeApplicationQuestions,
  type ApplicationFieldType,
  type ApplicationQuestion,
} from "@/lib/llm/application-extraction"
import type { Detected } from "@/lib/llm/indexed-details"
import {
  asObject,
  pagePrefixMessages,
  type CapturedBlock,
  type HarvestedField,
} from "@/lib/llm/indexed-shared"
import type { LlmMessage } from "@/lib/llm/openrouter"

export type IndexedQuestionsResult = {
  questions: ApplicationQuestion[]
  detected: Detected
}

const NATIVE_TYPE_WINS: Record<string, ApplicationFieldType> = {
  email: "email",
  tel: "tel",
  url: "url",
  number: "number",
  date: "date",
}

/** The type the control's DOM shape dictates when the LLM's choice is incompatible. */
export function domDefaultType(f: HarvestedField): ApplicationFieldType {
  switch (f.kind) {
    case "select":
      return "select"
    case "radio":
      return "radio"
    case "checkbox":
      return "checkbox"
    case "textarea":
    case "contenteditable":
      return "long_text"
    case "file":
      return "file"
    case "combobox":
      return "select"
    default: {
      const t = (f.inputType || "").toLowerCase()
      return NATIVE_TYPE_WINS[t] ?? "short_text"
    }
  }
}

/** LLM types allowed per DOM kind. Anything else snaps to domDefaultType(). */
function allowedTypes(f: HarvestedField): Set<ApplicationFieldType> {
  switch (f.kind) {
    case "select":
      return new Set(["select", "multi_select"])
    case "radio":
      return new Set(["radio"])
    case "checkbox":
      // a 2+-option group may be a select-all-that-apply; a lone checkbox stays a checkbox
      return (f.options?.length ?? 0) >= 2
        ? new Set(["checkbox", "multi_select"])
        : new Set(["checkbox"])
    case "textarea":
    case "contenteditable":
      return new Set(["long_text"])
    case "file":
      return new Set(["file"])
    case "combobox":
      return new Set(["select", "short_text"])
    default: {
      const t = (f.inputType || "").toLowerCase()
      if (NATIVE_TYPE_WINS[t]) return new Set([NATIVE_TYPE_WINS[t]]) // native type wins outright
      return new Set(["short_text", "long_text", "number", "url", "email", "tel", "date"])
    }
  }
}

const CONSENT_NOISE =
  /\b(privacy\s+(policy|notice|statement)|terms\s+(of|and|&)|t&c|consent|gdpr|data\s+(processing|protection)|newsletter|marketing\s+(emails?|communications?)|promotional)\b/i

/** Deterministic backstop for consent/legal noise. Applied to CHECKBOX questions only. */
export function isConsentNoise(label: string): boolean {
  return CONSENT_NOISE.test(label)
}

function renderFieldManifest(fields: HarvestedField[]): string {
  return fields
    .map((f) => {
      let s = `${f.id}: kind=${f.kind}`
      if (f.inputType) s += ` inputType=${f.inputType}`
      s += ` label="${f.label}"`
      if (f.required) s += " required"
      if (f.options?.length) s += ` options=[${f.options.join(" | ")}]`
      if (f.placeholder) s += ` placeholder="${f.placeholder}"`
      return s
    })
    .join("\n")
}

const TYPES_LIST = APPLICATION_FIELD_TYPES.join(", ")

export function buildIndexedQuestionsMessages(
  blocks: CapturedBlock[],
  fields: HarvestedField[],
): LlmMessage[] {
  const task =
    "Below are the REAL form controls harvested from this page, one per line, keyed by field id " +
    "(they also appear in the page as [field <id>: …] markers, so you can read their surrounding " +
    "context above):\n\n" +
    renderFieldManifest(fields) +
    "\n\nClassify each field. Return JSON only:\n" +
    '{"hasApplicationForm": boolean, "questions": [{"fieldId": string, "include": boolean, ' +
    '"label": string, "type": string, "required": boolean, "helpText": string|null}]}\n' +
    "Rules:\n" +
    `- type: one of ${TYPES_LIST}. Choose what the QUESTION asks for (a text input asking for years of experience is "number"; a LinkedIn field is "url").\n` +
    "- include: true only for questions a candidate answers as part of APPLYING. Exclude page " +
    "noise (search boxes, login, newsletter signup, cookie banners) AND consent/legal " +
    "acknowledgements (privacy policy, terms of service, data-processing consent, marketing opt-ins).\n" +
    "- label: the question as the candidate reads it, cleaned (strip a trailing required asterisk; " +
    "fix broken casing/whitespace). Keep the meaning — do not rephrase.\n" +
    "- required: true if the form marks it required (asterisk, the word required, aria-required) — " +
    "read the page context, the DOM attribute may be missing.\n" +
    "- helpText: any hint/sub-label shown with the field (file-type limits, formatting guidance), or null.\n" +
    "- Do NOT return options — they are taken from the DOM.\n" +
    "- Return one entry per field id above; never invent a field id.\n" +
    "If the page has no real application form, return hasApplicationForm=false and questions=[]."
  return [...pagePrefixMessages(blocks), { role: "user", content: task }]
}

export const QUESTIONS_RESPONSE_FORMAT: Record<string, unknown> = {
  type: "json_schema",
  json_schema: {
    name: "application_questions",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        hasApplicationForm: { type: "boolean" },
        questions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              fieldId: { type: "string" },
              include: { type: "boolean" },
              label: { type: "string" },
              type: { type: "string" },
              required: { type: "boolean" },
              helpText: { type: ["string", "null"] },
            },
            required: ["fieldId", "include", "label", "type", "required", "helpText"],
          },
        },
      },
      required: ["hasApplicationForm", "questions"],
    },
  },
}

export function resolveIndexedQuestions(
  raw: unknown,
  fields: HarvestedField[],
): IndexedQuestionsResult {
  const obj = asObject(raw)
  const byId = new Map(fields.map((f) => [f.id, f]))
  const order = new Map(fields.map((f, idx) => [f.id, idx]))
  const list = obj && Array.isArray(obj.questions) ? obj.questions : []

  type Decision = {
    fieldId: string
    include?: boolean
    label?: unknown
    type?: unknown
    required?: unknown
    helpText?: unknown
  }

  const kept: Array<{ field: HarvestedField; d: Decision }> = []
  const seen = new Set<string>()
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue
    const d = entry as Decision
    const field = typeof d.fieldId === "string" ? byId.get(d.fieldId) : undefined
    if (!field || seen.has(field.id)) continue // unknown or duplicate id → rejected
    seen.add(field.id)
    if (d.include !== true) continue
    kept.push({ field, d })
  }

  kept.sort((a, b) => (order.get(a.field.id) ?? 0) - (order.get(b.field.id) ?? 0))

  const rawQuestions = kept
    .map(({ field, d }) => {
      const label =
        typeof d.label === "string" && d.label.trim() ? d.label.trim() : field.label
      // Type: native input type wins; else LLM's choice if compatible; else DOM default.
      const nativeWin = NATIVE_TYPE_WINS[(field.inputType || "").toLowerCase()]
      let type: ApplicationFieldType
      if (field.kind === "text" && nativeWin) {
        type = nativeWin
      } else {
        const proposed = typeof d.type === "string" ? (d.type.trim() as ApplicationFieldType) : null
        type = proposed && allowedTypes(field).has(proposed) ? proposed : domDefaultType(field)
      }
      if (type === "checkbox" && isConsentNoise(label)) return null // deterministic backstop
      const q: Record<string, unknown> = { label, type }
      if (field.required === true || d.required === true) q.required = true // DOM wins upward
      if (field.placeholder) q.placeholder = field.placeholder
      if (typeof d.helpText === "string" && d.helpText.trim()) q.helpText = d.helpText.trim()
      if (field.options?.length) q.options = field.options // VERBATIM from the DOM harvest
      return q
    })
    .filter(Boolean)

  // The existing sieve still runs (clamps, coercion safety net, options only on choice types).
  const { questions } = normalizeApplicationQuestions({ questions: rawQuestions })
  return {
    questions,
    detected: {
      hasJobDetails: false, // this task doesn't judge details; the service fills it if needed
      hasApplicationForm: obj?.hasApplicationForm === true || questions.length > 0,
    },
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd webapp && npx vitest run lib/llm/indexed-questions.test.ts`
Expected: PASS. Note the `multi_select` question keeps its options through `normalizeApplicationQuestions` (multi_select is in `TYPES_WITH_OPTIONS`).

- [ ] **Step 5: Commit**

```bash
git add webapp/lib/llm/indexed-questions.ts webapp/lib/llm/indexed-questions.test.ts
git commit -m "feat(webapp): indexed questions classification merge (type matrix, verbatim options, consent filter)"
```

---

### Task 7: Validation schema + details service + route

**Files:**
- Create: `webapp/lib/validations/extract-indexed.ts`
- Create: `webapp/lib/server/extractions-indexed.ts`
- Create: `webapp/app/api/extract/indexed/route.ts`
- Create: `webapp/lib/server/extractions-indexed.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5 exports; `openRouterChat` from `@/lib/llm/openrouter`; `ApiError`, `prisma`, `env` (same imports as `lib/server/extractions.ts`).
- Produces:
  - `indexedExtractInputSchema` / `type IndexedExtractInput = { blocks: CapturedBlock[]; fields: HarvestedField[]; source?: string; url?: string }`
  - `extractJobIndexed(userId: string, input: IndexedExtractInput): Promise<{ fields: ExtractedJob; description?: string; detected: Detected; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }>`
  - `runIndexedCall(messages, responseFormat, models): Promise<ChatResult>` — internal helper with the one JSON-retry, exported for the questions service (Task 8) via a shared helper file? NO — keep it in `extractions-indexed.ts` and export it; Task 8 imports it.

- [ ] **Step 1: Validation schema**

Create `webapp/lib/validations/extract-indexed.ts`:

```ts
import { z } from "zod"

/**
 * Input validation for the INDEXED extraction routes (POST /api/extract/indexed +
 * /api/extract-application/indexed). The extension sends the page as numbered typed blocks
 * plus the harvested form fields; bounds mirror the capture-side caps (block text ≤ 2000
 * chars + a little marker slack; harvest MAX_FIELDS = 200; MAX_OPTIONS = 60).
 */

export const capturedBlockSchema = z.object({
  i: z.number().int().min(0),
  kind: z.enum(["heading", "para", "li", "row", "field"]),
  text: z.string().min(1).max(2400),
})

export const harvestedFieldSchema = z.object({
  id: z.string().min(1).max(24),
  label: z.string().min(1).max(400),
  kind: z.enum(["text", "textarea", "select", "radio", "checkbox", "combobox", "contenteditable", "file"]),
  inputType: z.string().max(30).optional(),
  options: z.array(z.string().min(1).max(300)).max(60).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(300).optional(),
})

export const indexedExtractInputSchema = z.object({
  blocks: z.array(capturedBlockSchema).min(1).max(4000),
  fields: z.array(harvestedFieldSchema).max(200).default([]),
  source: z.string().trim().max(255).optional(),
  url: z.string().trim().max(2000).optional(),
})

export type IndexedExtractInput = z.infer<typeof indexedExtractInputSchema>
```

- [ ] **Step 2: Write the failing service test**

Create `webapp/lib/server/extractions-indexed.test.ts`. Mock `openRouterChat` and `prisma`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const openRouterChat = vi.fn()
vi.mock("@/lib/llm/openrouter", () => ({ openRouterChat: (...a: unknown[]) => openRouterChat(...a) }))
vi.mock("@/lib/db", () => ({ prisma: { extractionLog: { create: vi.fn().mockResolvedValue({}) } } }))

import { extractJobIndexed } from "@/lib/server/extractions-indexed"
import type { IndexedExtractInput } from "@/lib/validations/extract-indexed"

const USAGE = { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedTokens: 0 }

function input(blockTexts: string[]): IndexedExtractInput {
  return {
    blocks: blockTexts.map((text, i) => ({ i, kind: "para" as const, text })),
    fields: [],
    source: "test",
    url: "https://x.test/job",
  }
}

beforeEach(() => openRouterChat.mockReset())

describe("extractJobIndexed", () => {
  it("runs one call under budget and resolves deterministically", async () => {
    openRouterChat.mockResolvedValueOnce({
      content: JSON.stringify({
        title: "Intern", company: null, location: null, salary: null,
        employmentType: null, workplaceType: null,
        descriptionRange: { start: 0, end: 0, exclude: [] },
        hasJobDetails: true, hasApplicationForm: false,
      }),
      usage: USAGE,
      model: "test/model",
    })
    const r = await extractJobIndexed("u1", input(["Intern wanted at Acme"]))
    expect(openRouterChat).toHaveBeenCalledTimes(1)
    expect(r.fields.title).toBe("Intern")
    expect(r.description).toBe("Intern wanted at Acme")
    expect(r.detected.hasJobDetails).toBe(true)
    expect(r.usage.totalTokens).toBe(120)
  })

  it("retries ONCE with a JSON nudge when the reply is unparsable, then succeeds", async () => {
    openRouterChat
      .mockResolvedValueOnce({ content: "not json at all", usage: USAGE, model: "m" })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          title: null, company: null, location: null, salary: null,
          employmentType: null, workplaceType: null, descriptionRange: null,
          hasJobDetails: false, hasApplicationForm: false,
        }),
        usage: USAGE,
        model: "m",
      })
    const r = await extractJobIndexed("u1", input(["hello"]))
    expect(openRouterChat).toHaveBeenCalledTimes(2)
    expect(r.fields).toEqual({})
  })

  it("runs the outline pre-pass when the page exceeds the token budget", async () => {
    // Build a page big enough to exceed INDEXED_TOKEN_BUDGET (24k tokens ≈ 96k chars):
    // 60 blocks × 1900 chars = 114k chars.
    const big = input(Array.from({ length: 60 }, (_, k) => `${k} ` + "x".repeat(1900)))
    openRouterChat
      .mockResolvedValueOnce({
        content: JSON.stringify({ regions: [{ start: 0, end: 3 }] }),
        usage: USAGE,
        model: "m",
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          title: null, company: null, location: null, salary: null,
          employmentType: null, workplaceType: null, descriptionRange: null,
          hasJobDetails: true, hasApplicationForm: false,
        }),
        usage: USAGE,
        model: "m",
      })
    await extractJobIndexed("u1", big)
    expect(openRouterChat).toHaveBeenCalledTimes(2)
    // The second (main) call's page prefix must only carry the kept blocks.
    const mainMessages = openRouterChat.mock.calls[1][0] as Array<{ content: string }>
    expect(mainMessages[1].content).toContain("B0|")
    expect(mainMessages[1].content).not.toContain("B59|")
  })

  it("throws ApiError after retry exhaustion", async () => {
    openRouterChat.mockResolvedValue({ content: "garbage", usage: USAGE, model: "m" })
    // resolve* returns an empty-but-valid result for garbage — so exhaustion only happens on
    // TRANSPORT errors. Simulate one:
    openRouterChat.mockRejectedValue(new Error("boom"))
    await expect(extractJobIndexed("u1", input(["x"]))).rejects.toThrow()
  })
})
```

⚠️ Nuance encoded above: `resolveIndexedDetails` never throws on garbage — it returns an empty result. The JSON retry triggers on `asObject(content) === null` (checked by the service before resolving), NOT on exceptions. Transport errors propagate as `ApiError`.

Run: `cd webapp && npx vitest run lib/server/extractions-indexed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `webapp/lib/server/extractions-indexed.ts`**

```ts
import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import { env } from "@/lib/env"
import type { ExtractedJob } from "@/lib/llm/extraction"
import {
  buildIndexedDetailsMessages,
  DETAILS_RESPONSE_FORMAT,
  resolveIndexedDetails,
  type Detected,
} from "@/lib/llm/indexed-details"
import {
  asObject,
  buildOutlineMessages,
  estimateTokens,
  parseOutlineRegions,
  sliceRegions,
  type CapturedBlock,
} from "@/lib/llm/indexed-shared"
import { openRouterChat, type ChatResult, type LlmMessage } from "@/lib/llm/openrouter"
import type { IndexedExtractInput } from "@/lib/validations/extract-indexed"

/**
 * Indexed details extraction service — the block-addressed OpenRouter pipeline.
 *
 * Under INDEXED_TOKEN_BUDGET: ONE model call over the full block doc. Over it: an outline
 * pre-pass picks the relevant regions first (rare — real postings compress well below the
 * budget). The model answers with values + a description block RANGE; resolution is
 * deterministic (verbatim slice, containment check) in lib/llm/indexed-details.ts.
 */

export type IndexedExtractionResult = {
  fields: ExtractedJob
  description?: string
  detected: Detected
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
const MAX_OUTPUT_TOKENS = 1200

export function extractionModels(): string[] {
  return [env.EXTRACTION_MODEL, ...env.EXTRACTION_FALLBACK_MODELS.split(",")]
    .map((m) => m.trim())
    .filter(Boolean)
}

/**
 * One chat call whose reply must parse as a JSON object; on a parse failure, ONE retry with
 * an explicit nudge appended. Shared by the details and questions services.
 */
export async function runIndexedCall(
  messages: LlmMessage[],
  responseFormat: Record<string, unknown>,
  title: string,
): Promise<{ result: ChatResult; parsed: Record<string, unknown> | null; calls: number }> {
  const models = extractionModels()
  const first = await openRouterChat(messages, {
    models,
    temperature: 0,
    maxTokens: MAX_OUTPUT_TOKENS,
    responseFormat,
    title,
  })
  let parsed = asObject(first.content)
  if (parsed) return { result: first, parsed, calls: 1 }

  const retryMessages: LlmMessage[] = [
    ...messages,
    { role: "user", content: "Your previous reply was not valid JSON. Return ONLY the JSON object matching the requested shape — no prose, no code fences." },
  ]
  const second = await openRouterChat(retryMessages, {
    models,
    temperature: 0,
    maxTokens: MAX_OUTPUT_TOKENS,
    responseFormat,
    title,
  })
  parsed = asObject(second.content)
  return {
    result: {
      ...second,
      usage: {
        inputTokens: first.usage.inputTokens + second.usage.inputTokens,
        outputTokens: first.usage.outputTokens + second.usage.outputTokens,
        totalTokens: first.usage.totalTokens + second.usage.totalTokens,
        cachedTokens: first.usage.cachedTokens + second.usage.cachedTokens,
      },
    },
    parsed,
    calls: 2,
  }
}

/**
 * When the block doc exceeds the token budget, ask for the relevant regions first and keep
 * only those blocks (plus the always-keep head and every field block). On ANY outline
 * failure, fall back to a deterministic clamp — never fail the extraction for the pre-pass.
 * Returns the (possibly reduced) blocks and the outline call's usage to fold into the log.
 */
export async function reduceBlocksIfOversized(
  blocks: CapturedBlock[],
  task: "details" | "questions",
): Promise<{ blocks: CapturedBlock[]; outlineUsage: typeof ZERO_USAGE; outlined: boolean }> {
  if (estimateTokens(blocks) <= env.INDEXED_TOKEN_BUDGET) {
    return { blocks, outlineUsage: ZERO_USAGE, outlined: false }
  }
  try {
    const res = await openRouterChat(buildOutlineMessages(blocks, task), {
      models: extractionModels(),
      temperature: 0,
      maxTokens: 400,
      title: "JobTracker Indexed Outline",
    })
    const regions = parseOutlineRegions(asObject(res.content), blocks.length)
    if (regions) {
      return {
        blocks: sliceRegions(blocks, regions),
        outlineUsage: {
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          totalTokens: res.usage.totalTokens,
        },
        outlined: true,
      }
    }
  } catch (err) {
    console.warn("[extractions-indexed] outline pre-pass failed, clamping:", String(err))
  }
  // Deterministic fallback: budget-worth of chars from the top + every field block.
  const budgetChars = env.INDEXED_TOKEN_BUDGET * 4
  let total = 0
  const kept: CapturedBlock[] = []
  for (const b of blocks) {
    if (b.kind === "field") {
      kept.push(b)
      continue
    }
    total += b.text.length
    if (total <= budgetChars) kept.push(b)
  }
  return { blocks: kept, outlineUsage: ZERO_USAGE, outlined: true }
}

export async function extractJobIndexed(
  userId: string,
  input: IndexedExtractInput,
): Promise<IndexedExtractionResult> {
  const contextChars = input.blocks.reduce((n, b) => n + b.text.length, 0)
  const startedAt = Date.now()

  try {
    const { blocks, outlineUsage, outlined } = await reduceBlocksIfOversized(
      input.blocks,
      "details",
    )
    const { result, parsed } = await runIndexedCall(
      buildIndexedDetailsMessages(blocks),
      DETAILS_RESPONSE_FORMAT,
      "JobTracker Indexed Details",
    )
    const resolved = resolveIndexedDetails(parsed, blocks)
    const usage = {
      inputTokens: result.usage.inputTokens + outlineUsage.inputTokens,
      outputTokens: result.usage.outputTokens + outlineUsage.outputTokens,
      totalTokens: result.usage.totalTokens + outlineUsage.totalTokens,
    }
    if (result.usage.cachedTokens > 0) {
      console.log(
        `[extractions-indexed] prompt cache hit: ${result.usage.cachedTokens}/${result.usage.inputTokens} input tokens reused`,
      )
    }
    await logExtraction({
      userId,
      source: input.source,
      url: input.url,
      model: `indexed${outlined ? "+outline" : ""}:${result.model}`,
      ...usage,
      contextChars,
      durationMs: Date.now() - startedAt,
      success: true,
    })
    return { ...resolved, usage }
  } catch (err) {
    await logExtraction({
      userId,
      source: input.source,
      url: input.url,
      model: `indexed:${env.EXTRACTION_MODEL}`,
      ...ZERO_USAGE,
      contextChars,
      durationMs: Date.now() - startedAt,
      success: false,
    })
    if (err instanceof ApiError) throw err
    throw new ApiError("INTERNAL", `Indexed extraction failed: ${String(err)}`)
  }
}

type LogInput = {
  userId: string
  source?: string
  url?: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  contextChars: number
  durationMs: number
  success: boolean
}

export async function logExtraction(input: LogInput) {
  // Never let a logging failure break the user's extraction — log it and move on.
  try {
    await prisma.extractionLog.create({
      data: {
        user: { connect: { id: input.userId } },
        source: input.source,
        url: input.url,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens: input.totalTokens,
        contextChars: input.contextChars,
        durationMs: input.durationMs,
        success: input.success,
      },
    })
  } catch (err) {
    console.error("[extractions-indexed] failed to write ExtractionLog:", err)
  }
}
```

- [ ] **Step 4: Route**

Create `webapp/app/api/extract/indexed/route.ts`:

```ts
import type { NextRequest } from "next/server"

import { ok, preflight, withRoute } from "@/lib/api/route"
import { getUserId } from "@/lib/auth/current-user"
import { extractJobIndexed } from "@/lib/server/extractions-indexed"
import { indexedExtractInputSchema } from "@/lib/validations/extract-indexed"

// POST /api/extract/indexed — block-addressed job-details extraction (see
// docs/superpowers/specs/2026-07-01-indexed-extraction-design.md). The extension sends the
// page as numbered blocks + harvested fields; the model points at content; values resolve
// deterministically. Returns { data: { fields, description?, detected, usage } }.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = indexedExtractInputSchema.parse(await req.json())
  const result = await extractJobIndexed(userId, input)
  return ok(result)
})

export const OPTIONS = preflight
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd webapp && npx vitest run lib/server/extractions-indexed.test.ts && npm run typecheck`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add webapp/lib/validations/extract-indexed.ts webapp/lib/server/extractions-indexed.ts webapp/lib/server/extractions-indexed.test.ts webapp/app/api/extract/indexed/route.ts
git commit -m "feat(webapp): indexed details service + route (outline fallback, JSON retry, logging)"
```

---

### Task 8: Questions service + route

**Files:**
- Create: `webapp/lib/server/application-extractions-indexed.ts`
- Create: `webapp/lib/server/application-extractions-indexed.test.ts`
- Create: `webapp/app/api/extract-application/indexed/route.ts`

**Interfaces:**
- Consumes: `runIndexedCall`, `reduceBlocksIfOversized`, `logExtraction` from `@/lib/server/extractions-indexed`; `buildIndexedQuestionsMessages`, `QUESTIONS_RESPONSE_FORMAT`, `resolveIndexedQuestions` from `@/lib/llm/indexed-questions`; `indexedExtractInputSchema`.
- Produces: `extractApplicationIndexed(userId, input): Promise<{ questions: ApplicationQuestion[]; detected: Detected; usage: {...} }>`

- [ ] **Step 1: Write the failing test**

Create `webapp/lib/server/application-extractions-indexed.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const openRouterChat = vi.fn()
vi.mock("@/lib/llm/openrouter", () => ({ openRouterChat: (...a: unknown[]) => openRouterChat(...a) }))
vi.mock("@/lib/db", () => ({ prisma: { extractionLog: { create: vi.fn().mockResolvedValue({}) } } }))

import { extractApplicationIndexed } from "@/lib/server/application-extractions-indexed"
import type { IndexedExtractInput } from "@/lib/validations/extract-indexed"

const USAGE = { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedTokens: 0 }

beforeEach(() => openRouterChat.mockReset())

describe("extractApplicationIndexed", () => {
  it("returns { questions: [] } with NO model call when zero fields were harvested", async () => {
    const input: IndexedExtractInput = {
      blocks: [{ i: 0, kind: "para", text: "Just a description page" }],
      fields: [],
      source: "t",
      url: "https://x.test",
    }
    const r = await extractApplicationIndexed("u1", input)
    expect(openRouterChat).not.toHaveBeenCalled()
    expect(r.questions).toEqual([])
    expect(r.detected.hasApplicationForm).toBe(false)
    expect(r.usage.totalTokens).toBe(0)
  })

  it("classifies harvested fields through the model and merges deterministically", async () => {
    const input: IndexedExtractInput = {
      blocks: [{ i: 0, kind: "field", text: '[field q1: dropdown "Country" — options: US | CA]' }],
      fields: [{ id: "q1", label: "Country", kind: "select", options: ["US", "CA"] }],
      source: "t",
      url: "https://x.test",
    }
    openRouterChat.mockResolvedValueOnce({
      content: JSON.stringify({
        hasApplicationForm: true,
        questions: [
          { fieldId: "q1", include: true, label: "Country", type: "select", required: false, helpText: null },
        ],
      }),
      usage: USAGE,
      model: "m",
    })
    const r = await extractApplicationIndexed("u1", input)
    expect(openRouterChat).toHaveBeenCalledTimes(1)
    expect(r.questions).toEqual([{ label: "Country", type: "select", options: ["US", "CA"] }])
    expect(r.detected.hasApplicationForm).toBe(true)
  })
})
```

Run: `cd webapp && npx vitest run lib/server/application-extractions-indexed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `webapp/lib/server/application-extractions-indexed.ts`**

```ts
import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"
import type { ApplicationQuestion } from "@/lib/llm/application-extraction"
import type { Detected } from "@/lib/llm/indexed-details"
import {
  buildIndexedQuestionsMessages,
  QUESTIONS_RESPONSE_FORMAT,
  resolveIndexedQuestions,
} from "@/lib/llm/indexed-questions"
import {
  logExtraction,
  reduceBlocksIfOversized,
  runIndexedCall,
} from "@/lib/server/extractions-indexed"
import type { IndexedExtractInput } from "@/lib/validations/extract-indexed"

/**
 * Indexed application-question extraction service. The model CLASSIFIES the harvested DOM
 * controls (it can't invent one); options/placeholders come from the DOM verbatim; the merge
 * (type matrix, consent filter, DOM order) is deterministic in lib/llm/indexed-questions.ts.
 * Zero harvested fields → { questions: [] } with NO model call — there is nothing to classify.
 */

export type IndexedApplicationResult = {
  questions: ApplicationQuestion[]
  detected: Detected
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

export async function extractApplicationIndexed(
  userId: string,
  input: IndexedExtractInput,
): Promise<IndexedApplicationResult> {
  const contextChars = input.blocks.reduce((n, b) => n + b.text.length, 0)
  const startedAt = Date.now()

  if (!input.fields.length) {
    await logExtraction({
      userId,
      source: input.source,
      url: input.url,
      model: "indexed:no-fields",
      ...ZERO_USAGE,
      contextChars,
      durationMs: Date.now() - startedAt,
      success: true,
    })
    return {
      questions: [],
      detected: { hasJobDetails: false, hasApplicationForm: false },
      usage: ZERO_USAGE,
    }
  }

  try {
    const { blocks, outlineUsage, outlined } = await reduceBlocksIfOversized(
      input.blocks,
      "questions",
    )
    const { result, parsed } = await runIndexedCall(
      buildIndexedQuestionsMessages(blocks, input.fields),
      QUESTIONS_RESPONSE_FORMAT,
      "JobTracker Indexed Questions",
    )
    const resolved = resolveIndexedQuestions(parsed, input.fields)
    const usage = {
      inputTokens: result.usage.inputTokens + outlineUsage.inputTokens,
      outputTokens: result.usage.outputTokens + outlineUsage.outputTokens,
      totalTokens: result.usage.totalTokens + outlineUsage.totalTokens,
    }
    if (result.usage.cachedTokens > 0) {
      console.log(
        `[application-extractions-indexed] prompt cache hit: ${result.usage.cachedTokens}/${result.usage.inputTokens} input tokens reused`,
      )
    }
    await logExtraction({
      userId,
      source: input.source,
      url: input.url,
      model: `indexed${outlined ? "+outline" : ""}:${result.model}`,
      ...usage,
      contextChars,
      durationMs: Date.now() - startedAt,
      success: true,
    })
    return { ...resolved, usage }
  } catch (err) {
    await logExtraction({
      userId,
      source: input.source,
      url: input.url,
      model: `indexed:${env.EXTRACTION_MODEL}`,
      ...ZERO_USAGE,
      contextChars,
      durationMs: Date.now() - startedAt,
      success: false,
    })
    if (err instanceof ApiError) throw err
    throw new ApiError("INTERNAL", `Indexed application extraction failed: ${String(err)}`)
  }
}
```

- [ ] **Step 3: Route**

Create `webapp/app/api/extract-application/indexed/route.ts`:

```ts
import type { NextRequest } from "next/server"

import { ok, preflight, withRoute } from "@/lib/api/route"
import { getUserId } from "@/lib/auth/current-user"
import { extractApplicationIndexed } from "@/lib/server/application-extractions-indexed"
import { indexedExtractInputSchema } from "@/lib/validations/extract-indexed"

// POST /api/extract-application/indexed — block-addressed application-question extraction.
// The model classifies the REAL harvested controls (never invents); options are copied
// verbatim from the DOM. Returns { data: { questions, detected, usage } }.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = indexedExtractInputSchema.parse(await req.json())
  const result = await extractApplicationIndexed(userId, input)
  return ok(result)
})

export const OPTIONS = preflight
```

- [ ] **Step 4: Run tests + typecheck + full webapp suite**

Run: `cd webapp && npx vitest run lib/server/application-extractions-indexed.test.ts && npm run typecheck && npx vitest run`
Expected: PASS / clean / full suite green.

- [ ] **Step 5: Commit**

```bash
git add webapp/lib/server/application-extractions-indexed.ts webapp/lib/server/application-extractions-indexed.test.ts webapp/app/api/extract-application/indexed/route.ts
git commit -m "feat(webapp): indexed application-questions service + route"
```

---

### Task 9: Extension wiring — background handlers + content orchestration

**Files:**
- Modify: `extension/background.js` (new message handlers after the `EXTRACT_APPLICATION_TIERED` block, ~line 68; new functions after `extractApplicationTiered`, ~line 253)
- Modify: `extension/content.js` (`EXTRACTION_MODE`, `requestExtraction`, `requestApplicationExtraction`)

**Interfaces:**
- Consumes: `JobTracker.scope.{scopePage, settle}` (Task 2), `UI.autofill.harvestQuestions` (Task 2), backend routes (Tasks 7–8).
- Produces: message types `EXTRACT_JOB_INDEXED` / `EXTRACT_APPLICATION_INDEXED` with `context: { blocks, fields, source, url }`; `requestExtraction()` resolves `{ fields, description, usage, detected, estimatedTokens }`; `requestApplicationExtraction()` resolves `{ questions, detected }`.

- [ ] **Step 1: background.js handlers**

After the `EXTRACT_APPLICATION_TIERED` handler block add:

```js
  // INDEXED (block-addressed) extraction — the default pipeline. The content script sends the
  // page as numbered blocks + harvested fields; the backend model points at content and the
  // values resolve deterministically (see docs/superpowers/specs/2026-07-01-indexed-extraction-design.md).
  if (msg?.type === "EXTRACT_JOB_INDEXED") {
    extractJobIndexed(msg.context || {})
      .then((r) =>
        sendResponse({
          ok: true,
          fields: r.fields,
          description: r.description,
          usage: r.usage,
          detected: r.detected,
        }),
      )
      .catch((err) => sendResponse({ ok: false, error: String(err), fields: {} }));
    return true;
  }
  if (msg?.type === "EXTRACT_APPLICATION_INDEXED") {
    extractApplicationIndexed(msg.context || {})
      .then((r) => sendResponse({ ok: true, questions: r.questions, detected: r.detected }))
      .catch((err) => sendResponse({ ok: false, error: String(err), questions: [] }));
    return true;
  }
```

After `extractApplicationTiered` add:

```js
// INDEXED details extraction: send the numbered blocks + harvested fields. The backend model
// answers with pointers (description block range) + small values; resolution is deterministic.
async function extractJobIndexed({ blocks, fields, source, url } = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!list.length) {
    dlog("extract-indexed: SKIPPED — no blocks");
    return { fields: {} };
  }
  dlog("extract-indexed: POST /api/extract/indexed | source:", source, "| blocks:", list.length, "| fields:", (fields || []).length);
  const result = await apiFetch("/api/extract/indexed", {
    method: "POST",
    body: JSON.stringify({ blocks: list, fields: fields || [], source, url }),
  });
  dlog("extract-indexed: got fields", result && result.fields, "| detected", result && result.detected, "| usage", result && result.usage);
  return {
    fields: (result && result.fields) || {},
    description: result && result.description,
    usage: result && result.usage,
    detected: result && result.detected,
  };
}

// INDEXED application-question extraction: same payload; the backend classifies the harvested
// controls (it can never invent a question) and copies options verbatim from the DOM.
async function extractApplicationIndexed({ blocks, fields, source, url } = {}) {
  dlog("extract-application-indexed: POST /api/extract-application/indexed | source:", source, "| blocks:", (blocks || []).length, "| fields:", (fields || []).length);
  const result = await apiFetch("/api/extract-application/indexed", {
    method: "POST",
    body: JSON.stringify({
      blocks: Array.isArray(blocks) ? blocks : [],
      fields: Array.isArray(fields) ? fields : [],
      source,
      url,
    }),
  });
  const questions = (result && result.questions) || [];
  dlog("extract-application-indexed: got", questions.length, "questions | detected", result && result.detected, "| usage", result && result.usage);
  return { questions, detected: result && result.detected };
}
```

- [ ] **Step 2: content.js — mode flag + shared indexed capture helper**

Change line 27:

```js
  // "indexed" = the block-addressed pipeline (POST /api/extract*/indexed) — the default.
  // Legacy: "llm" (Groq whole-page), "semantic" (RAG — to be deleted), "tiered" (non-LLM).
  const EXTRACTION_MODE = "indexed"; // "indexed" | "llm" | "semantic" | "tiered"
```

Add above `requestApplicationExtraction` (~line 358):

```js
  // Capture for the INDEXED pipeline: settle the DOM (SPA hydration), harvest the live form
  // controls, then scope the page WITH the harvest so field blocks carry the q<N> ids.
  async function captureIndexed() {
    if (SCOPE.settle) await SCOPE.settle();
    const harvest =
      UI.autofill && typeof UI.autofill.harvestQuestions === "function"
        ? UI.autofill.harvestQuestions()
        : { fields: [], controlIds: null };
    const scoped = SCOPE.scopePage ? SCOPE.scopePage({ harvest }) : null;
    if (!scoped || !scoped.blocks || !scoped.blocks.length) {
      throw new Error("Couldn't read this page's content.");
    }
    return scoped;
  }

  function sendExtractionMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (res && res.ok) resolve(res);
          else reject(new Error((res && res.error) || "Extraction failed"));
        });
      } catch (e) {
        reject(e);
      }
    });
  }
```

- [ ] **Step 3: content.js — indexed branch in `requestApplicationExtraction`**

At the top of `requestApplicationExtraction`, before the current `const scoped = …` line, add:

```js
    if (EXTRACTION_MODE === "indexed") {
      return (async () => {
        let scoped = await captureIndexed();
        // A slow-hydrating form can harvest empty on the first pass — settle and retry ONCE
        // before concluding "no application form".
        if (!scoped.fields.length && SCOPE.settle) {
          await SCOPE.settle({ quietMs: 400, maxMs: 3000 });
          scoped = await captureIndexed();
        }
        const res = await sendExtractionMessage({
          type: "EXTRACT_APPLICATION_INDEXED",
          context: {
            blocks: scoped.blocks,
            fields: scoped.fields,
            source: scoped.source,
            url: scoped.url,
          },
        });
        return { questions: res.questions || [], detected: res.detected };
      })();
    }
```

- [ ] **Step 4: content.js — indexed branch in `requestExtraction`**

At the top of `requestExtraction` (before `const scoped = SCOPE.scopePage …`), add:

```js
    if (EXTRACTION_MODE === "indexed") {
      return (async () => {
        const scoped = await captureIndexed();
        const estimatedTokens = Math.ceil(
          scoped.blocks.reduce((n, b) => n + b.text.length, 0) / 4,
        );
        try {
          const res = await sendExtractionMessage({
            type: "EXTRACT_JOB_INDEXED",
            context: {
              blocks: scoped.blocks,
              fields: scoped.fields,
              source: scoped.source,
              url: scoped.url,
            },
          });
          return {
            fields: res.fields || {},
            description: res.description,
            usage: res.usage,
            // Client-side detection (free) backs up the model's judgement: harvested
            // fields on the page mean an application form is present.
            detected: {
              hasJobDetails: !!(res.detected && res.detected.hasJobDetails),
              hasApplicationForm:
                !!(res.detected && res.detected.hasApplicationForm) || scoped.fields.length > 0,
            },
            estimatedTokens,
          };
        } catch (e) {
          e.estimatedTokens = estimatedTokens;
          throw e;
        }
      })();
    }
```

- [ ] **Step 5: Manual smoke check of the wiring (no Playwright/DevTools MCP)**

Run: `cd extension && ./node_modules/.bin/vitest run` (regression) and `cd webapp && npm run typecheck`.
Load-check happens in Task 12; nothing automated here.

- [ ] **Step 6: Commit**

```bash
git add extension/background.js extension/content.js
git commit -m "feat(extension): wire indexed extraction (settle → harvest → blocks → /indexed routes)"
```

---

### Task 10: Modal nudge — application form detected

**Files:**
- Modify: `extension/ui/modal.js` (inside `runDetailsExtraction`'s success handler, ~line 1740-1750, and `setDetailsState` at ~line 790)

**Interfaces:**
- Consumes: `res.detected` from `requestExtraction` (Task 9); existing `el`, `icon`, `ICON`, `dxNote`, `selectTab` closures in modal.js.
- Produces: after a successful details extraction that detected an application form, the details status line grows a one-click "Application form detected — extract questions" affordance that jumps to the Application tab.

- [ ] **Step 1: Implement**

In `runDetailsExtraction`, change:

```js
          applyExtraction(res);
          setDetailsState("done", null, res && res.usage);
          persistDetails();
```

to:

```js
          applyExtraction(res);
          setDetailsState("done", null, res && res.usage);
          // Adaptive UX: the capture knows an application form is on this page — surface the
          // next step instead of waiting for the user to find the Application tab.
          if (res && res.detected && res.detected.hasApplicationForm) {
            const go = el("button", {
              class: "dx-re",
              type: "button",
              title: "This page also has an application form — extract its questions",
            });
            go.append(icon(ICON.sparkles), el("span", { text: "Form detected — extract questions" }));
            go.addEventListener("click", () => selectTab("app"));
            dxNote.append(go);
          }
          persistDetails();
```

(`selectTab` is a function declaration in the same `open()` closure — hoisted, callable here.)

- [ ] **Step 2: Verify no regression**

Run: `cd extension && ./node_modules/.bin/vitest run`
Expected: PASS (modal has no unit tests; visual check happens in Task 12).

- [ ] **Step 3: Commit**

```bash
git add extension/ui/modal.js
git commit -m "feat(extension): surface application-form detection after details extraction"
```

---

### Task 11: Docs

**Files:**
- Modify: `webapp/docs/BACKEND.md` (add an "Indexed (block-addressed) extraction" subsection after the Tiered section, and add the two routes to the endpoint table)
- Modify: `MARKDOWN_EXTRACTION_ANALYSIS.md`, `SEMANTIC_EXTRACTION_SPEC.md`, `SEMANTIC_EXTRACTION_TESTING.md` (superseded-by note at top)

- [ ] **Step 1: BACKEND.md**

Endpoint table — add after the tiered rows:

```markdown
| POST   | `/api/extract/indexed` | `{ blocks, fields, source?, url? }` | INDEXED job fields (block-addressed LLM; default path) |
| POST   | `/api/extract-application/indexed` | `{ blocks, fields, source?, url? }` | INDEXED application questions (classifies harvested DOM controls) |
```

New subsection after "Tiered (non-LLM) extraction":

```markdown
### Indexed (block-addressed) extraction (`POST /api/extract/indexed` + `/api/extract-application/indexed`) — the default

The v2 pipeline (spec: `docs/superpowers/specs/2026-07-01-indexed-extraction-design.md`). The
extension captures the page as ORDERED, TYPED blocks (`{ i, kind, text }` — headings, paras,
list items, table rows, `[field q<n>: …]` markers) plus the harvested form fields, and the
model **points at content instead of regenerating it**:

- **Details** (`lib/server/extractions-indexed.ts` + `lib/llm/indexed-details.ts`): one
  OpenRouter call (`EXTRACTION_MODEL` chain, temperature 0, `json_schema`) returns small
  values + a `descriptionRange` block pointer. The description is sliced **verbatim** from the
  blocks (never truncated mid-sentence, never hallucinated); title/company/location/salary
  must pass a normalized containment check against the page text or they drop to null; enums
  validate against the existing vocab. Then the unchanged `normalizeExtractedFields` sieve.
- **Questions** (`lib/server/application-extractions-indexed.ts` + `lib/llm/indexed-questions.ts`):
  the model CLASSIFIES the harvested controls (include/label/type/required/helpText) and can
  never invent one — unknown fieldIds are rejected, `options` are copied **verbatim** from the
  DOM harvest (not in the LLM output at all), a type incompatible with the DOM kind snaps back,
  native input types (email/tel/url/number/date) win outright, and consent/legal checkboxes
  (privacy policy, terms, marketing) are excluded by prompt + a deterministic keyword backstop.
  Zero harvested fields → `{ questions: [] }` with NO model call. Then the unchanged
  `normalizeApplicationQuestions` sieve and the same `application.questions` save path.
- **Shared cached prefix.** Both prompts open with the byte-identical `system` + block-doc
  messages (`lib/llm/indexed-shared.ts`, `cache_control` breakpoints), so the second task on
  the same page re-reads the page from the provider cache.
- **Oversized pages** (est. tokens > `INDEXED_TOKEN_BUDGET`, default 24k): an outline pre-pass
  (headings + field blocks whole, prose truncated) asks for the relevant block regions first;
  on failure it clamps deterministically (head + all field blocks). Logged as
  `indexed+outline:<model>`.
- **Logging:** one `ExtractionLog` row per call, `model: "indexed:<resolved-model>"`, so cost
  and coverage compare directly against the legacy `llm`/`semantic`/`tiered` rows.
```

- [ ] **Step 2: Superseded notes**

Top of each of the three root docs, right under the title:

```markdown
> **Superseded (2026-07-01).** The extraction pipeline described/analyzed here has been
> replaced by INDEXED extraction — see
> `docs/superpowers/specs/2026-07-01-indexed-extraction-design.md`. Kept for the capture
> internals analysis and the library evaluations.
```

(For `SEMANTIC_EXTRACTION_SPEC.md`/`SEMANTIC_EXTRACTION_TESTING.md` say "replaced by" without the "kept for" clause.)

- [ ] **Step 3: Commit**

```bash
git add webapp/docs/BACKEND.md MARKDOWN_EXTRACTION_ANALYSIS.md SEMANTIC_EXTRACTION_SPEC.md SEMANTIC_EXTRACTION_TESTING.md
git commit -m "docs: indexed extraction endpoints + supersede semantic extraction docs"
```

---

### Task 12: Manual end-to-end verification (user-driven; no Playwright/DevTools MCP)

**Files:** none (checklist).

- [ ] **Step 1: Start the stack**

```bash
cd webapp && npm run dev   # http://localhost:3100
```

Reload the unpacked extension (chrome://extensions → JobTracker → reload).

- [ ] **Step 2: Verify per site** — Greenhouse, Ashby, Lever, Workable, one Notion-hosted posting (historic worst case), one split posting/apply pair (Ashby `…/application`):

For each: open posting → JobTracker panel → **Extract with AI** (Details):
- title/company/location/salary correct or absent (never wrong-page garbage);
- description complete (scroll to its end — no mid-sentence cut);
- if the page has a form: the "Form detected — extract questions" affordance appears.

Application tab → extract:
- every real question present, correct control type rendered;
- dropdown/radio options match the page EXACTLY (order + wording);
- privacy/terms/marketing checkboxes absent;
- no invented questions.

Save the job → open `/dashboard/jobs/<id>` → the application form preview renders the same questions (storage path unchanged).

- [ ] **Step 3: Check cost + cache telemetry**

```bash
cd webapp && npx prisma studio   # ExtractionLog table
```

Expect `model: "indexed:google/gemini-…"` rows with output tokens ~100–300; running Details then Questions on the same page should log a prompt-cache-hit line in the dev-server console for the second call.

- [ ] **Step 4: Failure modes**

- Stop the dev server → extract → the modal shows the error/retry state (no crash).
- A page with no form → Application tab shows the existing "no application form" empty state, and the service log shows `indexed:no-fields` with zero tokens.

---

### Task 13: Post-verification cleanup — delete the semantic path (+ experiment tab)

**Only after Task 12 passes on real sites.**

**Files:**
- Delete: `webapp/lib/llm/unstructured-parser.ts`, `webapp/lib/server/job-extraction-semantic.ts`, `webapp/app/api/extract/semantic/` (directory)
- Modify: `webapp/lib/env.ts` (remove `UNSTRUCTURED_API_KEY` if present), `webapp/.env` (remove the key)
- Modify: `extension/content.js` (remove the `"semantic"` branch in `requestExtraction` and its mention in the mode comment)
- Modify: `extension/background.js` (remove `EXTRACT_JOB_SEMANTIC` handler + `extractJobSemantic`)
- Delete: `extension/vendor/readability.bundle.js`, `extension/vendor/dom-to-semantic-markdown.bundle.js`, `extension/vendor/remark-mdast.bundle.js`
- Modify: `extension/manifest.json` (remove the three vendor entries)
- Modify: `extension/ui/modal.js` (delete the Experiment pane per the teardown checklist in its own block comment: the pane block, its `tabDefs` entry, the `experimentPane` in the body assembly, the `flask` icon, the `.exp*` CSS)

- [ ] **Step 1: Delete + detangle** (follow the file list above; grep for `semantic` and `Experiment` to catch stragglers: `grep -rn "extract/semantic\|EXTRACT_JOB_SEMANTIC\|UNSTRUCTURED" webapp/ extension/ --include="*.{ts,tsx,js,json}" -l`)
- [ ] **Step 2: Verify**

```bash
cd webapp && npm run typecheck && npx vitest run
cd ../extension && ./node_modules/.bin/vitest run
```

Reload the extension; details + questions extraction still work (indexed path untouched).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove semantic (Unstructured.io) extraction path + experiment tab"
```

**Not deleted:** the `tiered` path (kept as an A/B artifact per the spec — decided separately) and the legacy `llm` path (manual fallback until the indexed path has soaked).

---

## Self-review notes

- Spec coverage: §3.1-3.5 → Tasks 1-2, 9; §4 → Tasks 7-8; §5 → Task 4; §6 → Tasks 5, 7; §7 → Tasks 6, 8; §8 → Tasks 4, 7; §9 → Task 3; §10 → Tasks 7-9; §11 → Tasks 9-10, 13; §12 → per-task tests + Task 12; §13 (docs) → Task 11.
- Type consistency: `CapturedBlock`/`HarvestedField` defined once (Task 4) and imported everywhere; `runIndexedCall`/`reduceBlocksIfOversized`/`logExtraction` exported from Task 7 and consumed by Task 8; extension `scopePage({harvest})` shape matches `captureIndexed()` (Task 9).
- The `detected.hasJobDetails` from the questions task is intentionally `false` (that task doesn't judge details); the extension only reads `detected` off the details response plus its own client-side field count.
