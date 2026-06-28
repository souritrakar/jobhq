# Extraction fixtures

Static, committed artifacts captured by hand (once, read-only) from real job pages, used to test and
benchmark the **tiered (non-LLM) extractor** without a live browser — no chrome-devtools, no Playwright.

Per ATS (Greenhouse, Lever, Ashby, Workday, LinkedIn, Indeed, custom), capture:

- `*.jsonld` — a raw `<script type="application/ld+json">` body (job details, tier 1)
- `*.meta.json` — the page's `og:`/`twitter:`/`description` meta tags as a flat map
- `*.segments.json` — `{ key, value }[]` from `dl`/tables/microdata/"Key: value" lines (details, tier 2)
- `*.harvest.json` — the `HarvestedQuestionField[]` the extension's `harvestQuestions()` produced (questions)
- `*.expected.json` — the hand-labeled correct `ExtractedJob` / `ApplicationQuestion[]` (the accuracy gate)

`*.test.ts` files load these for deterministic unit tests (with a stubbed embedder). A separate
accuracy-vs-LLM harness (run manually, hits the real `embed()`) compares the tiered output against
`*.expected.json` and reports per-field precision/recall plus the tier-usage / token-cost delta.
