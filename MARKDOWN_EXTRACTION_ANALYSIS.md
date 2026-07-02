# Markdown Extraction & Serialization — Analysis & Improvement Brief

> **Superseded (2026-07-01).** The extraction pipeline described/analyzed here has been
> replaced by INDEXED extraction — see
> `docs/superpowers/specs/2026-07-01-indexed-extraction-design.md`. Kept for the capture
> internals analysis and the library evaluations.

> **Purpose.** This document captures how the extension turns a live web page into
> text/structured data for job + application-question extraction, how that compares to
> off-the-shelf libraries, where the current implementation is weak, and a concrete
> improvement backlog. It is written to be handed to a model (e.g. **Claude Fable 5**) later so
> it has full context to review the code and propose/implement improvements.
>
> **Date:** 2026-07-01. **Branch context:** `feat/reminders-delivery`.
> **Scope:** the extension's client-side capture pipeline and the temporary "Experiment" tab
> that compares serializers side by side.

---

## 0. TL;DR

- The extension's own serializer, **`capture.js` → `scopePage()`**, is a bespoke, deterministic,
  **no-LLM** DOM→text pipeline. It returns four things: `text`, `fullText`, `metadata`
  (`url`/`source`/`titleHint`), and `signals`.
- `fullText` is a **hand-rolled, token-minimal, form-aware markdown-ish linearization** of the
  page. It is NOT produced by any markdown library.
- It deliberately trades markdown fidelity (bold, links, tables, ordered-list numbers) for
  **compactness** and the one thing libraries don't do: **encoding form controls as typed
  markers** (`[email]`, `[dropdown: a | b]`, `(checkbox)`), which is what makes application
  questions survive.
- `signals` is a best-effort **structured** harvest (JSON-LD, meta, key→value segments) for the
  **non-LLM tiered extractor**. Its segment coverage is weak on modern layouts (see §5).
- Two libraries were evaluated in a temporary Experiment tab: **`dom-to-semantic-markdown`**
  (faithful markdown, form-blind) and **`@mozilla/readability`** (article extractor that
  **deletes forms**). Plus **`remark` / `mdast-util-from-markdown`** for AST/round-trip.
- **The known lesson (already encoded in code):** main-content extraction (Readability) silently
  drops must-have fields. Do not re-add content pruning to the real pipeline without a guard.

---

## 1. Where everything lives

### Real pipeline (production code)
| File | Role |
|---|---|
| `extension/parsers/clean-dom.js` | Stage A: deterministic DOM cleaner (clone + strip). Global `JobTracker.cleanDom.cleanDom(node)`. |
| `extension/parsers/capture.js` | Stage B/C: `toMarkdown()` serializer + `scopePage()` + `harvestStructuredSignals()`. Global `JobTracker.scope`. |
| `extension/content.js` | Orchestration: calls `scopePage()`, routes to backend messages for details / questions / autofill. |
| `extension/background.js` | Service worker: POSTs to backend `/api/extract`, `/api/extract/semantic`, `/api/extract/tiered`, `/api/extract-application`, `/api/extract-application/tiered`, autofill match. |
| `extension/ui/application.js` | `harvestFields()` — a SEPARATE live-DOM harvester of form controls (for tiered questions + autofill), independent of `scoped.text`. |

### Temporary Experiment tab (throwaway — remove later)
| File | Role |
|---|---|
| `extension/ui/modal.js` | "Experiment" tab (search `Experiment pane (⚠️ TEMPORARY)`). Buttons + pipeline + downloads. |
| `extension/vendor/dom-to-semantic-markdown.bundle.js` | Official browser build (IIFE global `htmlToSMD`). |
| `extension/vendor/remark-mdast.bundle.js` | esbuild IIFE of `remark` + `mdast-util-from-markdown` (global `markdownExperiments`). |
| `extension/vendor/readability.bundle.js` | esbuild IIFE of `@mozilla/readability` (global `mozReadability`). |
| `extension/manifest.json` | The three bundles are in `content_scripts` (before `content.js`). |

**Removal checklist for the experiment** (documented in the modal block header): delete the three
`vendor/*.bundle.js`, remove their `content_scripts` entries, and in `modal.js` delete the
Experiment pane block, its `tabDefs` entry, the `experimentPane` in the `body` assembly, the
`flask` icon, and the `.exp*` CSS.

---

## 1.5 Related / prior implementation docs — embeddings, semantic RAG, tiered (READ THESE)

The embeddings/semantic work is **backend** and is **already documented elsewhere** — this file does
NOT restate it. There are **three distinct embedding usages** (all reuse one `embed()` seam), each
consuming something the extension produces (`signals`, `fullText`, or harvested fields):

### The one embeddings seam
- **`webapp/lib/llm/embeddings.ts`** — the single, swappable `embed(texts)` function.
  Uses **OpenRouter** hosted embeddings, model **`openai/text-embedding-3-small`** (1536-dim),
  key **`OPENROUTER_API_KEY`**, override via `EMBEDDINGS_MODEL`. No vector DB anywhere; all matching
  is in-memory cosine over tens/hundreds of vectors. Moving to self-hosted FastEmbed = one-file swap.
  Server-side only (never bundled into the extension).
  > ⚠️ **Doc drift to fix:** `webapp/docs/BACKEND.md` (autofill section) says "OpenAI
  > text-embedding-3-small / `OPENAI_API_KEY`", but the code uses **OpenRouter / `OPENROUTER_API_KEY`**.
  > Trust `embeddings.ts`.

### Usage 1 — Autofill field matching (fills a live application form)
- **Code:** `webapp/lib/server/autofill.ts`, `webapp/lib/application/field-matching.ts`
  (+ `field-matching.test.ts`). Extension side: `harvestFields()` in `extension/ui/application.js`.
- **What:** embed the saved-answer questions + the live page's harvested fields, in-memory cosine +
  greedy one-to-one assignment with a confidence floor. Profile autofill (`PROFILE_AUTOFILL_FIELDS`)
  runs through the **same** matcher.
- **Doc:** `webapp/docs/BACKEND.md` → "Autofill" section (~L199–223).

### Usage 2 — Tiered (LLM-free) extraction — the direct consumer of `signals` (§5)
- **Code:** `webapp/lib/extraction/` → `details-tiered.ts`, `questions-tiered.ts`,
  `structured-data.ts`, `prototypes.ts`, `prototype-embeddings.ts` (+ `.test.ts`, `__fixtures__/`).
  Routes: `/api/extract/tiered`, `/api/extract-application/tiered` (`extractions-tiered.ts`,
  `application-extractions-tiered.ts`).
- **What:** Tier 1 = deterministic structured-data parse of `signals` (JSON-LD → meta → segments →
  `h1`). Tier 2 (only for attribute fields tier 1 missed) = embed the segment **keys** / field
  **labels**, match against **prototype vectors** (embedded once, process-memoized), with a
  semantic **inclusion gate**. Zero generation tokens; often zero embed calls. `model` recorded as
  `tiered:<tiers>` (e.g. `tiered:jsonld+embeddings`) so cost/coverage compare directly to LLM paths.
- **Docs:** `docs/superpowers/specs/2026-06-28-tiered-extraction-design.md` (design) +
  `webapp/docs/BACKEND.md` (~L87–88, L392–422). Memory: `[[tiered-extraction-module]]`.

### Usage 3 — Semantic RAG extraction (LLM path that solved the Groq 413)
- **Code:** `webapp/lib/server/job-extraction-semantic.ts`, `webapp/lib/llm/markdown-sectioner.ts`;
  route `webapp/app/api/extract/semantic/route.ts`. Consumes `fullText`.
- **What:** parse → detect semantic sections (Description/Requirements/Benefits/…) → chunk → embed
  chunks → semantic-search the relevant chunks per field → one small LLM call on the retrieved
  context (so a huge page never blows the token wall).
- **Docs:** `SEMANTIC_EXTRACTION_SPEC.md` + `SEMANTIC_EXTRACTION_TESTING.md` (repo root).

### How this file relates
`§2–§6` here cover the **client-side capture** (`fullText`/`signals`) that feeds Usages 2 & 3. The
improvement backlog (`§8`) is about **raising the quality of that input** — better `signals`
coverage directly improves the tiered embeddings matcher (Usage 2), and better `fullText` directly
improves the semantic RAG path (Usage 3). The embeddings/matching logic itself is out of scope here;
see the docs above.

---

## 2. Architecture: one capture, three consumers

`scopePage()` (`capture.js:201`) returns:

```ts
{
  text: string,      // fullText.slice(0, 6000)  — whole-page LLM path (Groq token wall)
  fullText: string,  // pageMarkdown(100000)      — semantic LLM path (backend chunks it)
  url: string,       // clean origin+pathname
  source: string,    // hostname (www. stripped)
  titleHint: string, // document.title
  signals: {         // structured harvest for the NON-LLM tiered extractor
    jsonLd: string[],                       // raw JSON-LD blocks, UNPARSED
    meta: { [k: string]: string },          // og:/twitter:/description only
    segments: { key: string, value: string }[],
    h1: string,
    titleHint: string,
  }
}
```

**`capture.js` uses NO LLM.** It is the "dumb, generic half." The model call (if any) happens on
the **backend**. Three extraction strategies consume one capture:

1. **Whole-page LLM** — reads `text` (small markdown), one model call → all fields.
2. **Semantic LLM** — reads `fullText` (untruncated), backend chunks/retrieves so nothing is lost.
3. **Tiered / non-LLM** — reads `signals`, parses deterministically (JSON-LD → meta → segments).
   Zero tokens, zero hallucination, but only as good as what the site publishes.

Ban-safety: reads only the rendered DOM, issues **no page-level fetch/XHR**. User-triggered
(runs on Save click), never during idle browsing.

**Application questions** additionally have their own live-DOM harvester `harvestFields()`
(`application.js:635`) which reads controls directly and does NOT depend on `scoped.text` — so a
JS-rendered form whose markdown came back empty still has live controls to harvest
(`content.js:366`).

---

## 3. How `fullText` markdown is created

Two-stage, deterministic, **no markdown library**:

```
live <body> ──cleanDom()──▶ cleaned clone ──toMarkdown()──▶ raw md ──normalize/slice──▶ fullText
```

### Stage A — `cleanDom(document.body)` (clean-dom.js)
Clones first (live page never mutated; cloned `<script>` is inert). Four passes:

1. **removeNoise** — delete HTML comments + subtrees of
   `REMOVED_TAGS = {script, style, noscript, svg, canvas, iframe, link, meta}`.
2. **stripAttrs** — **allowlist** `KEPT_ATTRS = {href, alt, title, aria-label, datetime, type,
   name, value, placeholder, label, role}`. Everything else (`class`, `id`, `style`, `data-*`,
   `on*`) dropped. (Allowlist, not blocklist — new tracking attrs can't leak in.)
3. **normalizeText** — collapse `\s+` → single space in text nodes; drop empties.
4. **pruneEmptyChildren** — bottom-up removal of meaningless elements. `KEEP_IF_EMPTY =
   {input, textarea, select, option, img, br, hr, td, th, source, area, col}` survive even when
   empty (a bare `<input>` is still a field).

### Stage B — `toMarkdown(node)` (capture.js:60)
Recursive walk; per-node rules:

- **Text node** → value (whitespace-collapsed).
- **Form controls → typed markers** (the reason this exists):
  - `<input>` → `[type: placeholder]` e.g. `[email: you@x.com]`; `checkbox`/`radio` →
    `(checkbox)` / `(radio: value)`; `type=hidden` dropped.
  - `<textarea>` → `[long text]`; `<select>` → `[dropdown: opt | opt]`; `<option>` → `""`.
- `<img>` → `[image: alt]` (or nothing); `<br>` → newline.
- Recurse children into `inner`, then wrap by tag:
  - `h1`–`h6` → `\n\n# inner\n`
  - `<li>` → `\n- inner` (⚠️ **ordered lists lose numbering** — always `-`)
  - `<label>`/`<legend>` → `\ninner ` (keeps label with its field)
  - `<a>` → `inner` only (⚠️ **href dropped**; page URL is in `metadata.url`)
  - BLOCK tags `{div, section, article, header, footer, main, p, ul, ol, fieldset, form, nav,
    aside, table, tr}` → `\n` + inner
  - other inline (`span, strong, em, code, button, …`) → `inner` (⚠️ **emphasis dropped** — no
    `**`/`*`/`` ` ``)

### Stage C — normalize + slice (`pageMarkdown`, capture.js:103)
Collapse spaces/tabs, trim around newlines, collapse 3+ blank lines → 2, `trim()`, `slice(limit)`.

### Worked example
```html
<div class="wrap"><h1>Senior <span>Data</span> Scientist</h1>
<p>We are <strong>hiring</strong>.</p><input type="email" placeholder="you@x.com"></div>
```
→
```
# Senior Data Scientist

We are hiring.

[email: you@x.com]
```
(638 chars HTML → 172 chars markdown in a fuller demo; the shrink is much larger on real pages.)

---

## 4. `fullText` vs `dom-to-semantic-markdown`

Both are DOM→markdown; they optimize opposite priorities. Same input, both outputs:

```
capture.js fullText                    dom-to-semantic-markdown
─────────────────────                  ────────────────────────
We are hiring a backend dev.           We are **hiring** a *backend* dev.
See details.                           See [details](https://acme.com/apply?ref=1).

- First                                1. First
- Second                               2. Second

SalaryLocation                         | Salary | Location |
$150kRemote                            | --- | --- |
                                       | $150k | Remote |
Email * [email: you@x.com]             Email * Country USA India
Country [dropdown: USA | India]
```

| | capture.js `fullText` | dom-to-semantic-markdown |
|---|---|---|
| Built as | bespoke ~40-line serializer, no deps | general-purpose npm library |
| Bold/italic/code | ❌ dropped | ✅ kept |
| Links/URLs | ❌ text only (URL → `metadata`) | ✅ `[text](url)`, `refifyUrls` option |
| Ordered lists | ❌ become bullets | ✅ numbered |
| Tables | ❌ flattened/garbled (`SalaryLocation`) | ✅ real `\|` tables + column tracking |
| **Form fields** | ✅ **typed markers** | ❌ mashed text, no types |
| Metadata | separate (`metadata` + `signals`) | can inline via `includeMetaData` |
| Token cost | lower (aggressive) | higher (faithful) |
| Cleaning | explicit allowlist strip stage | own handling + `extractMainContent` |

**`dom-to-semantic-markdown` options** (exposed in the Experiment tab): `extractMainContent`
(its own main-content heuristic, `findMainContent`), `refifyUrls` (replace long/repeated URLs with
`ref0`, `ref1`… + a `urlMap` to save tokens), `enableTableColumnTracking` (`<!-- col-N -->`
comments), `includeMetaData` (pull `<head>` title/meta into the output).

**Verdict:** for a job **description**, the library gives nicer, richer markdown. For
**application questions** (and token budget), `capture.js` wins because it encodes field types and
strips everything else. `capture.js`'s **table handling is a genuine weakness** — cells
concatenate with no separator, so tabular data is garbled.

---

## 5. `signals` and the segment-harvest coverage problem

`signals` fields:

- **`jsonLd`** — raw text of every `<script type="application/ld+json">`. **Unparsed strings.**
  Bounds: ≤15 blocks, ≤20,000 chars each. Usually the jackpot (`schema.org/JobPosting`).
- **`meta`** — `<meta property|name>` whitelisted to keys starting `og:`/`twitter:` or exactly
  `description`. Bounds: ≤40 entries, ≤5,000 chars each.
- **`segments`** — generic `{key, value}[]` from four DOM patterns. No dedup/scoring. Bounds:
  ≤250 segments, key ≤120, value ≤400.
- **`h1`**, **`titleHint`** — strings, ≤2,000 chars.

### The four segment patterns (`harvestSegments`, capture.js:147)
1. Definition lists — `<dt>` → following `<dd>` (direct children only).
2. Two-column tables — `<th>`/first `<td>` = key, next cell = value.
3. Microdata — `[itemprop]` → name → `content`/`datetime`/text.
4. Inline "Key: value" — regex `^([A-Za-z][A-Za-z0-9 /&_-]{1,30}):\s*(.{1,400})$` over
   `li,p,span,div` with ≤2 children and ≤200 chars text.

### Coverage test (7 realistic layouts) — **only 1 clean hit, 1 garbage**
| Case | Layout | Result |
|---|---|---|
| A | label/value in sibling `<div>`s (grid) | ❌ missed |
| B | icon + chip, no text key | ❌ missed |
| C | column-oriented table (headers row 1) | ⚠️ **garbage** `{Remote: Full-time}`, `$150k` dropped |
| D | `<dt>/<dd>` wrapped in a `<div>` | ❌ missed |
| E | `<script id="__NEXT_DATA__" type="application/json">` | ❌ missed |
| F | parenthetical key `Base salary (USD):` | ❌ missed (`(` not in key charset) |
| G | plain `Job type: Full-time` | ✅ captured |

### Why it's *arguably* fine by design
- `segments` is a best-effort **free fast-path**, not source of truth.
- `jsonLd` (which most real ATS/boards emit) carries canonical fields.
- Anything missed **renders as visible text** → lands in `fullText` → the LLM reads it. So the
  cost of poor segment coverage is **recall/tokens**, not correctness.
- The backend embedding-matcher **filters** segments (keeps only keys near known fields), so
  garbage (case C) is discarded, not mis-saved. Precision handled downstream; recall is the gap.

It is NOT "enough" if the goal were to extract everything without ever calling an LLM.

---

## 6. `@mozilla/readability` — why it deletes application questions

Readability is Firefox Reader View's **article** extractor. Empirically (verified):
1. It **strips form controls** — `<input>`/`<select>`/`<textarea>` removed; only stray `<label>`
   text can survive.
2. It **discards low-text sections** — an application form scores near-zero on text density and
   gets dropped wholesale as "boilerplate."

So Readability ON → clean **description**, but the **questions vanish**. This is exactly the
lesson already baked into `capture.js:50`:

> "there is deliberately NO heuristic 'main-content' (Readability) stage here. It silently
> dropped must-have fields — e.g. the company name... Don't re-add content extraction without a
> proven guard."

Matching tool to goal:

| Goal | Best path |
|---|---|
| Clean job **description** | Readability ON → dom-to-semantic-markdown |
| Application **questions** | Readability OFF, ideally `capture.js` (typed form markers) |

`remark` / `mdast-util-from-markdown` are markdown **parsers** (markdown → mdast AST / round-trip).
In the experiment they consume the SAME markdown produced by step 1 (they can't read HTML alone).

---

## 7. The Experiment tab (temporary) — what it does

A tab in the save-job modal (opened by the Save button). Pipeline + standalone comparison, every
run downloads its artifact locally with a clear name
(`jobtracker-experiment_<host>_<YYYYMMDD-HHMMSS>_<suffix>`):

- **Step 0 (option): Readability cleanup (Mozilla)** — clone doc → `Readability.parse()` → clean
  article HTML (default ON; falls back to full page if no article).
- **Step 1: Page → Markdown** — `dom-to-semantic-markdown` (`convertElementToMarkdown` on body,
  or `convertHtmlToMarkdown` on the Readability HTML). This markdown is the SOURCE for 2 & 3.
- **Step 2: Markdown → mdast AST** — `mdast-util-from-markdown` → mdast JSON.
- **Step 3: Markdown → remark round-trip** — `remark().processSync(md)`.
- **Run all & download** — runs 1→3 with one shared timestamp.
- **capture.js (scopePage)** — standalone: downloads pure `fullText` markdown; logs
  `metadata` + `signals` to the console.

---

## 8. Improvement backlog (for a later review to consider)

Ordered by rough ROI. None are committed decisions — they are candidates to evaluate.

### A. Raise `signals.segments` recall (biggest gap for modern/SPA sites)
1. **Harvest embedded non-ld+json state** — `<script id="__NEXT_DATA__">`, other
   `type="application/json"`, `window.__INITIAL_STATE__`/Redux dumps. On SPA boards
   (Greenhouse/Lever/Ashby/Workday) this often contains the entire job as clean JSON. Highest ROI.
   Add as a new `signals` field (e.g. `embeddedJson: string[]`) rather than overloading `jsonLd`.
2. **Sibling label→value pattern** — a short label-ish element immediately followed by a value
   element (covers grid/flex layouts, cases A & D). Needs a heuristic for "looks like a label"
   (short text, ends with `:` or has a label-ish class/role) without exploding false positives.
3. **Column-oriented tables** — detect an all-`<th>` header row, map columns to each data row
   instead of pairing raw cells; avoids garbage (case C) and captures dropped columns.
4. **`<dl>` with `<div>` wrappers** — walk descendants for `dt`/`dd` instead of direct children;
   support multiple `<dd>` per `<dt>`.
5. **Loosen the inline-KV key charset** — allow `()`, accents, longer keys (case F).
6. **Minor:** read `aria-label`/`title` on icon chips; consider `data-*` where clearly labeled.

### B. Fix `fullText` table serialization
- Tables currently garble (cells concatenate with no separator). At minimum insert a separator
  between cells (`" | "`) and a newline per row; ideally emit a real markdown table. Weigh token
  cost vs. the value of tabular data (salary bands, benefits matrices) to extraction.

### C. Decide what fidelity `fullText` actually needs
- Emphasis and ordered-list numbering are dropped. Confirm the extractors don't need them (they
  probably don't). Document the decision so it isn't "fixed" later by accident.

### D. Consider adopting `dom-to-semantic-markdown` for the DESCRIPTION only
- Could produce a cleaner description field (real links/tables/emphasis) while `capture.js`
  continues to own field/question extraction. Trade-off: a dependency + larger tokens. Evaluate
  whether description quality actually improves downstream results.

### E. Guardrails if any main-content pruning is ever added
- Per the `capture.js:50` warning: never prune to "main content" without a proven guard that
  must-have fields (company name in header/nav, the application form) survive. Readability is
  disqualified for the questions path for exactly this reason.

### F. Testing
- The extension has vitest + jsdom (`extension/*.test.js`, run the local binary, not npx). Any
  change to `harvestSegments`/`toMarkdown` should add fixtures (the 7 cases in §5 are a good seed)
  asserting expected `{key,value}` pairs and markdown shapes.

---

## 9. Quick reference — globals available in the content-script world
- `JobTracker.cleanDom.cleanDom(node)` — the cleaner.
- `JobTracker.scope.scopePage()` / `.harvestStructuredSignals()` — the capture.
- `htmlToSMD.*` — dom-to-semantic-markdown (experiment only).
- `markdownExperiments.{fromMarkdown, remark}` — remark/mdast (experiment only).
- `mozReadability.{Readability, isProbablyReaderable}` — Readability (experiment only).

All experiment bundles were produced with esbuild `--format=iife --global-name=<name>` (browser
target). The libraries are pure JS; Readability + remark need a DOM (`document`) which exists in a
content script (and in jsdom for tests).
