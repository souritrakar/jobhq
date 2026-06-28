# Tiered (structured-data + embeddings) extraction — an LLM-free alternative

**Date:** 2026-06-28
**Status:** Implemented (alternative module; default still LLM)

## Problem

Every job capture sends ~5–20k chars of page markdown to a generation LLM (Groq `gpt-oss-20b`)
**twice** per posting — once for job **details** (`lib/llm/extraction.ts`) and once for application
**questions** (`lib/llm/application-extraction.ts`). That is the dominant token cost and latency in
the capture flow, and it ignored structured data already on the page (no JSON-LD / schema.org /
microdata / OG parsing existed anywhere). Meanwhile the extension already had the two ingredients a
cheaper extractor needs: the raw DOM (form controls, `<script type="ld+json">`, meta tags) and a
working embeddings + cosine matcher used for autofill (`lib/application/field-matching.ts`).

## Goal

A separate, plug-and-play module that uses deterministic structured-data parsing + embeddings instead
of a generation LLM — cutting token cost to ~zero and lowering latency, while matching-or-beating
accuracy and keeping the existing absence checks. **Alternative, not a replacement**: no existing LLM
code is deleted or changed; both paths stay live and we A/B them.

**Decisions:** reuse OpenRouter `text-embedding-3-small` (existing `embed()` seam) · **pure non-LLM**
(the module never calls the LLM; the existing `/api/extract*` routes are the manual fallback) ·
separate `/tiered` routes · no client-side JSON-LD fast-path (deferred).

## Architecture

Two tiered extractors, each a new backend service + route fed by an extended extension capture, both
returning the **exact same response shapes** as the current routes.

### Job details — `lib/extraction/details-tiered.ts`
1. **Structured data (deterministic, free):** JSON-LD `schema.org/JobPosting` (`structured-data.ts`) →
   microdata/segments → OG/meta. Maps title, hiringOrganization.name, jobLocation, `baseSalary`
   (composed from MonetaryAmount, never converted), `employmentType` (schema enum → our vocab),
   `jobLocationType: TELECOMMUTE → Remote`, description (HTML stripped).
2. **Embeddings (only for attribute fields tier 1 missed):** embed the page's `{key,value}` segment
   **keys**, match to field prototypes (`prototypes.ts`) with the shared autofill `MIN_SCORE`, snap
   free-text enums to the vocab (stricter `TIERED_ENUM_MIN_SCORE`, else drop). A JSON-LD-complete page
   makes **zero** embed calls. Title/company/description fall back to JSON-LD → meta → `h1`.

### Application questions — `lib/extraction/questions-tiered.ts`
1. **Deterministic DOM harvest:** the extension's `harvestQuestions()` (reuses the autofill label
   heuristics, **includes file inputs**, carries native input type); `mapHarvestToQuestions()` maps DOM
   kind + type → our 12-type vocab.
2. **Embeddings inclusion gate:** keep a field iff its label is semantically closer to the question
   prototypes than to the noise prototypes (search/login/newsletter/cookie). Structurally-strong fields
   (choice/file/long-text/required) only need to beat noise; weak free-text fields must also clear
   `TIERED_QUESTION_KEEP_FLOOR` and beat noise by `TIERED_NOISE_MARGIN`.

**No vector DB.** Tens of prototype vectors, embedded once per process (`prototype-embeddings.ts`,
memoized), matched in-memory — exactly like the autofill matcher.

## Files

New (`webapp/lib/extraction/`): `prototypes.ts`, `structured-data.ts`, `prototype-embeddings.ts`,
`details-tiered.ts`, `questions-tiered.ts` (+ `__fixtures__/`, `*.test.ts`). New services
`lib/server/{extractions,application-extractions}-tiered.ts`; validation `lib/validations/extract-tiered.ts`;
routes `app/api/extract/tiered/route.ts` + `app/api/extract-application/tiered/route.ts`.

Changed (additive): `lib/application/field-matching.ts` (export `MIN_SCORE`), `lib/env.ts` (`TIERED_*`),
`extension/parsers/capture.js` (`harvestStructuredSignals` + `signals` on `scopePage`),
`extension/ui/application.js` (`harvestQuestions` on `UI.autofill`),
`extension/background.js` (tiered clients + handlers), `extension/content.js` (`EXTRACTION_MODE` flag,
branches `requestExtraction` / `requestApplicationExtraction`). Default `EXTRACTION_MODE = "llm"`.

## Absence checks — unchanged

The amber title/company/description warnings and the "no application form" empty state read the final
field values / questions array, not how they were produced. The tiered modules emit the same shapes and
run the same `normalize*` sieves, so an unfilled field comes back absent exactly as the LLM path leaves
it — the same warning fires. A `coverage`/`confidence` score is computed and logged for A/B telemetry
but **never** triggers an LLM call (pure non-LLM).

## How to A/B

Flip `EXTRACTION_MODE = "tiered"` in `extension/content.js`, reload the unpacked extension, capture a
few real ATS pages, and compare against the LLM path. `ExtractionLog` rows tag the tier used
(`tiered:jsonld+embeddings`, …) with zero generation tokens, so cost/coverage compare directly.

## Tests

`webapp/lib/extraction/*.test.ts` (vitest, node env, stub embedder like `field-matching.test.ts`):
structured-data mappers across JSON-LD shapes/`@graph`/salary/enum/`TELECOMMUTE`/HTML; details tier-1
zero-embed + tier-2 segment match + enum snap; questions type mapping + inclusion gate keeps real
questions / drops noise. A `__fixtures__/` convention (committed `.jsonld`/`.harvest.json`/`expected.json`
per ATS) backs a future accuracy-vs-LLM harness. No new HTML-parser dependency — the extension parses
the live DOM; the backend only does `JSON.parse` + string mapping.

## Known limitations / risks

- Context-blind ambiguity (e.g. a contact "Email" vs a newsletter "Email") — the relative gate handles
  most; the LLM path is the manual fallback.
- Multi-step / SPA forms: the harvest sees the rendered step only — identical to today's LLM capture.
- Custom comboboxes without DOM `<option>`s fall back to text (no visible options to read).
