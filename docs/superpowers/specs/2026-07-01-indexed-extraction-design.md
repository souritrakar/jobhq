# Indexed Extraction (v2) — block-addressed LLM extraction for job details + application questions

**Date:** 2026-07-01
**Status:** Approved design, not yet implemented
**Supersedes (as default path):** whole-page Groq (`/api/extract`, `/api/extract-application`),
semantic RAG (`/api/extract/semantic`, Unstructured.io), tiered non-LLM (`/api/extract*/tiered`).
Legacy paths stay selectable during verification; the semantic path is deleted after verification.

---

## 1. Problem

The extension extracts (1) job posting details and (2) application-form questions from the
rendered page. The two may or may not co-exist on one page, so the user gets separate actions.
Current pains:

1. **Token walls / cost.** Whole-page path slices markdown to 6,000 chars (silently losing
   content) and still hit Groq free-tier 413/429s. No principled token optimization.
2. **Accuracy of the retrieval path.** The semantic RAG path (embeddings + chunk retrieval)
   misses fields and returns cut-off descriptions; it also depends on the external
   Unstructured.io parsing API.
3. **Redundancy.** When both tasks run on one page, the same page context is paid for twice.
4. **Representation.** The DOM→text conversion must retain what BOTH tasks need (prose fidelity
   for details, typed form controls for questions). Tables currently garble; retrieval-style
   pruning (Readability) deletes forms.

Hard requirements: generalizable (no per-site code, no JSON-LD/network-tab reliance as the
backbone), no scraping APIs (Firecrawl/context.dev), handles large pages, strict schema output
(null stays null, no hallucinated values), clean values (they are saved to the DB), exact
dropdown options, correct question types, privacy/consent noise excluded.

Priorities: **accuracy > cost > UX.** Latency: <5s ideal, 10s acceptable.

## 2. Approach (approved)

**One capture → one addressable block index → one LLM call per task on a cheap OpenRouter
model.** The LLM acts as an *identifier*: it points at content (block ranges, field IDs) and we
fetch the values deterministically. It does not regenerate large content, so output stays ~50–200
tokens, cannot truncate mid-description, and cannot hallucinate what it merely points to.

- Description → block range → verbatim deterministic slice.
- Questions → classification of *harvested real DOM controls* (stable field IDs); the LLM cannot
  invent a question or an option.
- Small fields → strict JSON values + a normalized containment check against page text.
- No embeddings/RAG in this pipeline. Rate limits stop mattering (OpenRouter paid, flash-class
  models); cost is input-heavy but flash-priced and prompt-cached.
- Large pages → a two-stage outline pass (identify relevant regions first) as an automatic
  escape hatch; rare.

## 3. Client: Capture v2 (`extension/parsers/capture.js`)

### 3.1 Block emitter

`toMarkdown()` is refactored into a block emitter over the existing `cleanDom()` clone (the
cleaner is unchanged). Output: ordered `blocks: [{ i, kind, text }]` where
`kind ∈ heading | para | li | row | field`.

- Same serialization rules as today (headings `#`–`######`, list items, label/legend prefixing,
  link text only, inline tags flattened), except:
- **Tables fixed:** each `<tr>` emits one `row` block, cells joined with `" | "`.
- **Form controls** emit `field` blocks that embed the harvested field's ID (see 3.2), e.g.
  `[field q7: dropdown "Country" — options: United States | Canada | …]`,
  `[field q2: text "Full name" (required)]`. Marker text is informative for the LLM; the
  authoritative data lives in the harvested field list.
- Bounds: total block text capped (same 100k-char ceiling as `FULL_TEXT_MAX`); per-block text
  capped (e.g. 2,000 chars) with the remainder flowing into a continuation block so nothing is
  silently dropped.

### 3.2 Field harvest linkage

At capture time, `scopePage()` also runs the existing `harvestQuestions()`
(`extension/ui/application.js` — live-DOM harvester: ARIA/HTML label resolution, radio/checkbox
grouping by name, custom option-button clusters, comboboxes, file inputs, native `inputType`,
real `<option>` values in page order, `required`, `placeholder`). The same `q<N>` IDs are used in
the `field` blocks, so the block doc and field list cross-reference.

During the block walk, when a form control element is reached, it is matched back to its
harvested descriptor (by element identity captured during harvest) to stamp the ID. A control
the harvest skipped (noise/hidden) renders as today's anonymous marker with no ID.

### 3.3 `scopePage()` v2 return shape

```js
{
  blocks: [{ i, kind, text }],
  fields: [{ id, label, kind, inputType?, options?, required?, placeholder? }], // harvestQuestions()
  url, source, titleHint,
  // legacy outputs kept until old paths are deleted:
  text, fullText, signals,
}
```

### 3.4 DOM readiness (settle gate)

Capture is click-triggered so the page is normally rendered, but slow-hydrating SPA forms exist.
Before capture: wait until `document.readyState === "complete"` AND no DOM mutations for ~300ms
(MutationObserver), capped at ~2.5s total, then capture regardless. Additionally, if a
*questions* extraction harvests zero fields, re-settle and retry the harvest **once** before
reporting "no application form". Multi-step wizard forms (only step 1 rendered) remain out of
scope — inherent to reading the rendered DOM, same as today.

### 3.5 Detection (client-side, free, drives adaptive UX)

The capture itself knows: `fields.length > 0` (an application form is likely present) and prose
volume (details likely present). `content.js` uses this to adapt the UI — e.g. after a details
extraction, if fields were detected, proactively surface the "Extract application questions"
action instead of waiting for the user to hunt for it. The LLM's `hasJobDetails` /
`hasApplicationForm` booleans (below) are returned too and may refine this later.

## 4. Wire: endpoints

Two new routes mirroring the existing pair (same response envelopes, same `withRoute` wrapper,
same `ExtractionLog` writes, `userId`-scoped):

| Route | Body | Response |
|---|---|---|
| `POST /api/extract/indexed` | `{ blocks, fields, source?, url? }` | `{ data: { fields, description?, detected, usage } }` |
| `POST /api/extract-application/indexed` | `{ blocks, fields, source?, url? }` | `{ data: { questions, detected, usage } }` |

`detected = { hasJobDetails, hasApplicationForm }` (from the LLM output). Zod validation in
`lib/validations/extract-indexed.ts` bounds counts and lengths (blocks ≤ 4,000; block text ≤
2,000 chars; fields ≤ existing `MAX_FIELDS`; option counts/lengths per existing caps).

**Prompt-cache layout preserved:** both prompts share a byte-identical prefix
(`system + rendered block doc`); only the task tail differs. Running the second task on the same
page re-reads the page from the provider cache.

## 5. Backend: block document rendering

`lib/llm/indexed-extraction.ts` (pure, no I/O — sibling of `extraction.ts`) renders the block
doc as numbered lines:

```
B12| ## About the role
B13| We are hiring a Software Engineering Intern to…
B40| [field q7: dropdown "Country" — options: United States | Canada | …]
```

Line numbers are the block indices, so a "range" answer resolves trivially and unambiguously.

## 6. Job details task

### 6.1 LLM call

One call. `response_format: json_schema` (strict) where the model supports it; the existing
`asObject` fence-stripping parser as fallback. Temperature 0, max_tokens ~1,200. Output schema:

```json
{
  "title": "string|null",
  "company": "string|null",
  "location": "string|null",
  "salary": "string|null",
  "employmentType": "Full-time|Part-time|Contract|Internship|Temporary|Freelance|Volunteer|Apprenticeship|null",
  "workplaceType": "Remote|Hybrid|On-site|null",
  "descriptionRange": { "start": "int", "end": "int", "exclude": ["int"] },
  "hasJobDetails": "boolean",
  "hasApplicationForm": "boolean"
}
```

`descriptionRange` is nullable. Prompt rules mirror today's field guide (salary as written, never
converted; null when absent; unlabeled values are fine — read the page text, e.g. a title that
appears without a "Role:" header).

### 6.2 Deterministic post-processing

- **Description = verbatim slice**: `blocks[start..end]` minus `exclude` minus `field`-kind
  blocks, re-rendered as markdown (headings as `##`, `li` as `- `, `row` as cell-joined lines,
  paragraphs as-is). Range guards: integers, within bounds, `start ≤ end`, `exclude ⊆ range`;
  any violation → description **absent** (never a guess) → the extension's existing amber
  warning fires.
- **Containment check (anti-hallucination)** on `title`, `company`, `location`, `salary`:
  normalize both sides (lowercase, collapse whitespace, strip punctuation/unicode dashes) and
  require the value to appear as a substring of the normalized page text (blocks + titleHint).
  Failing values are dropped to null. Enums skip this (they are vocabulary mappings, checked
  against their allowed sets instead).
- Then the existing `normalizeExtractedFields` sieve runs unchanged (trim, drop
  `null`/`N/A`/sentinels).

## 7. Application questions task

### 7.1 Principle: the LLM classifies; it never invents

Input: the shared block-doc prefix + the harvested field list rendered as a numbered manifest.
Output (strict JSON):

```json
{
  "hasApplicationForm": "boolean",
  "questions": [
    {
      "fieldId": "q7",
      "include": true,
      "label": "string",
      "type": "one of the 12 APPLICATION_FIELD_TYPES",
      "required": "boolean?",
      "helpText": "string?"
    }
  ]
}
```

### 7.2 Deterministic merge + validation (`lib/llm/indexed-extraction.ts` + service)

- **`fieldId` must exist** in the submitted harvest; unknown IDs are rejected (dropped).
  Excluded/omitted fields simply don't appear. Output is re-sorted to DOM order (harvest
  sequence).
- **Options are copied verbatim from the harvest by `fieldId`** — never from the LLM (they are
  not even in its output schema). The harvest reads real `<option>` elements and real
  radio/checkbox/button-cluster labels in page order and already drops `Select…` placeholder
  rows. The LLM cannot paraphrase, reorder, or invent an option. Custom comboboxes with no DOM
  options stay optionless (nothing readable exists).
- **Type compatibility matrix** (DOM kind → allowed LLM types; violations snap back to the
  DOM-derived default, listed first):
  - `select` → `select`, `multi_select`
  - `radio` (native groups + button clusters) → `radio`
  - `checkbox` group (2+ shared name) → `checkbox`, `multi_select`
  - `checkbox` standalone → `checkbox`
  - `textarea` / `contenteditable` → `long_text`
  - `file` → `file`
  - `combobox` → `select`, `short_text`
  - `text` → by native `inputType` when specific (`email`→`email`, `tel`→`tel`, `url`→`url`,
    `number`→`number`, `date`→`date` — these win outright); otherwise `short_text`,
    `long_text`, `number`, `url`, `email`, `tel`, `date` (LLM may refine a bare text input).
- **Placeholder** comes from the harvest (DOM truth); `label`/`helpText`/`required` may be
  cleaned/filled by the LLM (labels on real pages are often noisy; `required` may be stated in
  text the DOM attribute misses). `required: true` from the DOM harvest is never un-set by
  the LLM (DOM wins upward).
- **Privacy/consent exclusion:** the prompt instructs dropping consent/legal acknowledgements —
  privacy policy, terms of service, "I consent to my data being processed", GDPR notices,
  marketing/newsletter opt-ins. A deterministic keyword post-filter backstops it (case-insensitive
  match on the label for e.g. `privacy policy`, `terms`, `consent`, `gdpr`, `data processing`,
  `newsletter`, `marketing`, applied to `checkbox`-type questions only, so a legitimate question
  like "Do you consent to a background check?" — a radio — survives). The current few-shot
  example in `application-extraction.ts` *includes* a consent checkbox; the new prompt's example
  excludes it and demonstrates the exclusion.
- Everything then flows through the **unchanged** `normalizeApplicationQuestions` sieve (clamps,
  type coercion safety net, options only on choice types) and the **unchanged** save path:
  `application.questions` JSONB on `JobApplication`, slug `id`s + `order` + `questionCount` +
  `schemaVersion` assigned server-side (`shapeStoredQuestions`). Zero storage changes; the job
  detail page, `JobApplicationAnswer` rows, autofill, and the extension read-only view keep
  working as-is.
- **Zero harvested fields** → `{ questions: [], detected: { hasApplicationForm: false } }` with
  **no LLM call** (nothing to classify), after the client's one settle-retry (3.4).

## 8. Large-page fallback (outline pass)

- Token estimate = total block chars / 4. Under `INDEXED_TOKEN_BUDGET` (default 24,000) → the
  normal single call. This covers virtually all real postings after capture compression.
- Over budget → **outline pass first**: render a compressed skeleton — every `heading` block in
  full, every `field` block in full, other blocks as first ~80 chars + block index — and ask the
  model (same cheap model, tiny output) for the block regions relevant to the task
  (`{ regions: [{ start, end }] }`). Slice those regions (plus the first ~40 blocks
  unconditionally — titles/company live at the top), then run the normal call on the kept
  blocks. Two round trips, ≤ ~7s, rare.
- Hard ceiling stays (100k chars); a pathological page beyond it is clamped with a logged
  warning.

## 9. Model & config

- Through the existing **non-streaming OpenRouter client** (`lib/llm/openrouter.ts`) — same
  pattern as answer drafts: model fallback CHAIN, `cache_control` breakpoint on the shared page
  prefix, AbortController wall-clock bound, temperature 0.
- New envs: `EXTRACTION_MODEL` + `EXTRACTION_FALLBACK_MODELS` (chain default: a Gemini
  Flash-Lite-class model, then a GLM-Flash-class model — concrete IDs pinned at implementation
  time against OpenRouter's current catalog), `INDEXED_TOKEN_BUDGET`.
- `GROQ_API_KEY`/Groq client remain only for the legacy routes until those are deleted.
- Each call writes one `ExtractionLog` row with `model: "indexed:<resolved-model>"` (plus
  `indexed-outline:` for the fallback's first stage) so cost/accuracy compare directly against
  legacy rows.

## 10. Error handling

- LLM/JSON failure → one retry with a "return only valid JSON matching the schema" nudge →
  then `ApiError` → the extension's existing retry UI.
- Invalid `descriptionRange` → description absent; warnings fire. Never a guess.
- Containment-check failure → that field null. Never a guess.
- Unknown `fieldId` / incompatible type → dropped / snapped, logged (console) for tuning.
- Outline pass failure on an oversized page → fall back to clamped single call (first
  `INDEXED_TOKEN_BUDGET` worth of blocks + all field blocks), logged.

## 11. Extension orchestration & migration

- `EXTRACTION_MODE = "indexed"` becomes the default in `content.js`; new message types
  `EXTRACT_JOB_INDEXED` / `EXTRACT_APPLICATION_INDEXED` in `background.js` POST the new routes.
- Legacy `llm` / `semantic` / `tiered` branches remain selectable during verification.
- After verification on real ATS pages: delete the semantic path (`UNSTRUCTURED_API_KEY`,
  `lib/llm/unstructured-parser.ts`, `lib/server/job-extraction-semantic.ts`,
  `app/api/extract/semantic/`, extension branches), and the Experiment tab per the teardown
  checklist in `modal.js` (vendor bundles, manifest entries, pane/CSS). Whether the tiered path
  stays as an A/B artifact is decided separately — it is not load-bearing for v2.
- Repo-root docs (`MARKDOWN_EXTRACTION_ANALYSIS.md`, `SEMANTIC_EXTRACTION_*.md`) get a
  superseded-by note pointing here.

## 12. Testing

- **Extension (vitest + jsdom, local binary):** block-emitter fixtures — tables (row blocks,
  cell separators), ordered/unordered lists, label+control adjacency, the 7 layout cases from
  `MARKDOWN_EXTRACTION_ANALYSIS.md` §5; harvest→block ID linkage (the `q<N>` in the field block
  matches the harvested descriptor); settle-gate (readyState + mutation quiescence + cap);
  zero-field retry-once.
- **Webapp (vitest, stubbed LLM):** block-doc rendering (numbering, caps, continuation blocks);
  details post-processing (range slicing, all range-guard violations, markdown re-rendering,
  containment check incl. unicode-dash/whitespace normalization, enum validation); questions
  merge (fieldId rejection, options copied verbatim, full type-compat matrix, DOM-required
  never un-set, consent keyword filter incl. the background-check radio counter-case, DOM-order
  restore); outline skeleton rendering + region slicing + first-40-blocks rule; prompt builders
  emit byte-identical prefixes for both tasks.
- **Manual end-to-end:** Greenhouse, Ashby, Lever, Workable, a Notion-hosted posting (historic
  worst case), one split posting/apply-page pair; verify options fidelity, types, consent
  exclusion, description completeness, and `ExtractionLog` cost rows vs legacy.

## 13. Decisions log

- **OpenRouter, any suitable cheap model; cost-aware, reliability first** (user).
- **Fully self-contained parsing** — Unstructured.io dropped (assistant call, user delegated).
- **Description is a verbatim slice**, not an LLM rewrite (user: finalize at end; approved with
  design). A deterministic cleanup pass may be added later; no second LLM call.
- **Shared index + per-task calls** with client-side detection driving adaptive UX (user).
- **Consent scope:** all legal/consent acknowledgement *checkboxes* are excluded (privacy,
  terms, data processing, marketing). Non-checkbox questions that merely contain "consent"
  (e.g. background-check radios) are kept.
- **Containment check is drop-on-failure** (accuracy priority: a value not present on the page
  is treated as hallucination).
- **No JSON-LD / network-tab reliance** anywhere in this pipeline (user constraint).
