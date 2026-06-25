# Save a job from a URL (in-app import)

**Date:** 2026-06-23
**Status:** Implemented (2026-06-23) — see "Implementation notes" at the end.

## Problem & goal

Today a job is only saved through the Chrome extension, which captures the rendered
page and calls `/api/extract` (+ `/api/extract-application`) with the page text. The
web app's **"Save a job"** button in the dashboard sidebar is inert.

Goal: let a user paste a **job posting URL** into a modal and have the app fetch,
read, and save that posting — **without the extension** — landing the exact same
`Job` (+ optional `JobApplication`) record any other save produces. This is the
"do it for one job without installing the extension" path.

## Hard constraints (from the user)

1. **One external call, no added LLM spend on our side.** The extraction must happen
   *inside* a single **Firecrawl** request (Firecrawl's own LLM), not through our
   Groq pipeline. We already pay for Groq on the extension path; this path must not
   add to *our* LLM calls.
2. **Firecrawl config = `json` format (+ `branding`), nothing else.** Of the scrape
   formats (Markdown, Summary, Question, Highlights, Links, HTML, Screenshot, JSON,
   Branding, Images), only **JSON** does structured extraction with a schema+prompt
   in one shot; **Branding** rides along in the *same* call to supply the logo
   (chosen over a separate context.dev lookup). `onlyMainContent: true` strips
   nav/boilerplate before extraction.
3. **Same schema & save path as every other job.** Map Firecrawl's output into the
   existing `createJobSchema` and call the existing `createJob()` service — so
   dedup-by-URL, application-question persistence, and validation are identical.
4. **Accuracy first.** Carry over every guardrail from our two existing extraction
   prompts (`lib/llm/extraction.ts`, `lib/llm/application-extraction.ts`): use only
   what the page states, never invent, `null`/empty when absent.

## Architecture

```
Dashboard sidebar "Save a job"  ──click──▶  <ImportJobDialog>  (client, base-ui Dialog)
                                                  │  POST /api/jobs/import { url }
                                                  ▼
                              app/api/jobs/import/route.ts  (withRoute, userId-scoped)
                                                  │  validate { url }
                                                  ▼
                              lib/server/job-import.ts  ── importJobFromUrl(userId, url)
                                 │ 1. ONE Firecrawl /v2/scrape  (json + branding)
                                 │ 2. map → normalizeExtractedFields + normalizeApplicationQuestions
                                 │ 3. logoUrl from branding (job-board guardrail)
                                 │ 4. build CreateJobInput → createJob(userId, input)
                                 ▼
                              existing createJob()  →  Job (+ JobApplication), deduped by URL
```

New files:
- `lib/llm/firecrawl.ts` — thin server-side Firecrawl client (raw `fetch`, mirrors
  `lib/llm/groq.ts`: timeout, error→`ApiError` mapping, key from env).
- `lib/llm/job-import-extraction.ts` — **pure** builder of the Firecrawl `json`
  schema + extraction prompt, and a mapper from Firecrawl's raw output to our
  existing normalized field/question shapes. No I/O (sibling of `extraction.ts`).
- `lib/server/job-import.ts` — `importJobFromUrl()` orchestration (the only I/O).
- `app/api/jobs/import/route.ts` — `POST` + `OPTIONS`.
- `lib/validations/job-import.ts` — `importJobSchema = z.object({ url: z.string().url() })`.
- `components/ui/dialog.tsx` — token-styled wrapper over `@base-ui/react/dialog`
  (Root/Portal/Backdrop/Popup/Title/Description/Close), matching `button.tsx`.
- `components/dashboard/import-job-dialog.tsx` — the modal + its states.

Changed files:
- `lib/env.ts` — add `FIRECRAWL_API_KEY` (+ optional `FIRECRAWL_MODEL`/timeout consts).
- `webapp/.env` — add the key (gitignored; not committed).
- `components/dashboard/dashboard-shell.tsx` — make the "Save a job" button open the
  dialog (lift it into a client wrapper; keep the sidebar markup).
- `components/dashboard/saved-jobs-browser.tsx` — empty-state CTA opens the dialog
  too, and the page refreshes on success (`router.refresh()`).

## The single Firecrawl request

`POST https://api.firecrawl.dev/v2/scrape`
Headers: `Authorization: Bearer $FIRECRAWL_API_KEY`, `Content-Type: application/json`
Body:
```jsonc
{
  "url": "<user url>",
  "onlyMainContent": true,
  "timeout": 60000,
  "formats": [
    { "type": "json", "prompt": "<combined guardrail prompt>", "schema": <combined schema> },
    { "type": "branding" }
  ]
}
```
Response read at `data.json` (extracted fields) and `data.branding` (logo). The exact
`branding` format encoding (string `"branding"` vs object) will be **verified against
the live API during implementation** since I have the key.

### Combined JSON schema (`data.json`)

Mirrors `EXTRACTION_FIELDS` + the `ApplicationQuestion` shape (12 `APPLICATION_FIELD_TYPES`):

```jsonc
{
  "type": "object",
  "properties": {
    "title":          { "type": ["string","null"] },
    "company":        { "type": ["string","null"] },
    "location":       { "type": ["string","null"] },
    "salary":         { "type": ["string","null"] },
    "employmentType": { "type": ["string","null"],
                        "enum": ["Full-time","Part-time","Contract","Internship","Temporary","Freelance","Volunteer","Apprenticeship", null] },
    "workplaceType":  { "type": ["string","null"], "enum": ["Remote","Hybrid","On-site", null] },
    "description":    { "type": ["string","null"] },
    "applicationQuestions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label":       { "type": "string" },
          "type":        { "type": "string", "enum": [ ...APPLICATION_FIELD_TYPES ] },
          "placeholder": { "type": ["string","null"] },
          "helpText":    { "type": ["string","null"] },
          "required":    { "type": ["boolean","null"] },
          "options":     { "type": ["array","null"], "items": { "type": "string" } }
        },
        "required": ["label","type"]
      }
    }
  },
  "required": ["title","company","description","applicationQuestions"]
}
```

### The prompt (guardrails)

A single prompt string assembled from the existing prompts' rules so accuracy matches
the extension path:
- Role: read ONE job posting page and return the fields + the application form
  questions as JSON matching the schema.
- **Job details** rules (from `extraction.ts`): title = role only; company = hiring
  company only; salary verbatim with currency/period, never estimate; employment/
  workplace from the fixed sets or null; description = posting body cleaned of
  nav/boilerplate but faithful (keep paragraphs/bullets); **use only what the page
  states, never guess/infer/invent; null when genuinely absent.**
- **Application form** rules (from `application-extraction.ts`): include the
  example-led field guide (control-type definitions, label-vs-placeholder, options
  rules, required detection); **ignore the job description, marketing copy, nav,
  cookie/consent, login/search, and submit/cancel buttons** — only real form fields
  the candidate must fill in count; **if the page has no application form, return
  `applicationQuestions: []`** (many posting pages put the form behind an Apply
  button — that's expected and fine). Cap ~60 questions.
- Output: JSON only, exactly the schema keys.

## Mapping → existing save path

In `job-import-extraction.ts` (pure):
1. Run the 7 detail fields through the existing **`normalizeExtractedFields`** (drops
   `null`/`"N/A"`/empties → clean strings).
2. Run `applicationQuestions` through the existing **`normalizeApplicationQuestions`**
   (coerces `type` to the allowed set, clamps lengths/counts, drops option junk and
   label-less entries) → `{ questions }`.
3. Logo: pick `branding.logo || branding.images?.logo || branding.images?.ogImage`;
   validate it's an `http(s)` URL; **job-board guardrail** — if the posting host is a
   known aggregator (linkedin, indeed, glassdoor, ziprecruiter, greenhouse, lever,
   ashby, workday/myworkdayjobs, wellfound, builtin, monster, dice, …) **and** the
   candidate logo is hosted on that same aggregator domain, drop it (it's the board's
   logo, not the company's) → `logoUrl` stays empty. Favicons are excluded (too low-res).

In `job-import.ts`:
4. Build `CreateJobInput`: `{ title, company, url, location, description, salary,
   employmentType, workplaceType, source: <hostname>, logoUrl, status: "SAVED",
   application: questions.length ? { questions } : undefined }`. Parse it through
   `createJobSchema` (same validation as the extension), then `createJob(userId, input)`.
5. **Require title + company.** If Firecrawl returns neither (page wasn't a readable
   posting / was blocked), throw `ApiError("UNPROCESSABLE", "We couldn't read a job
   posting at that link…")` so the UI can show a clear, actionable error instead of
   saving an empty shell. `createJob` already dedups by URL (re-import updates, never
   duplicates, and preserves pipeline status).

## API contract

`POST /api/jobs/import` → body `{ url: string }`
- `201 { data: <Job incl. application> }` on success.
- `400` invalid URL (zod), `422` unreadable posting, `429`/`402` Firecrawl rate/credit
  limit (mapped to a friendly message), `500` otherwise. Uses the shared `withRoute`
  envelope and `getUserId` (dev → `DEV_USER_ID`).

## Modal UX (the part the user emphasized)

`components/ui/dialog.tsx` (base-ui) + `ImportJobDialog`. Neutral SaaS surface, Fern as
the only accent, design-system tokens. States:

- **Idle:** title "Save a job from a link", subtext, URL `Input` (autofocus,
  `type="url"`, placeholder `https://…/jobs/…`), primary "Import job" button
  (disabled until the field parses as a URL), "Cancel". Enter submits.
- **Loading (10–40s; Doherty):** input disabled, button shows a `Loader2` spinner +
  rotating reassurance copy on a timer ("Fetching the posting…" → "Reading the
  details…" → "Extracting application questions…" → "Saving…"), `aria-live="polite"`.
  The request is abortable; closing/Cancel aborts it.
- **Success:** animated check, a compact preview (logo tile or initial, title,
  company, location, a "N application questions" pill when present), actions:
  **"View job"** (→ `/dashboard/saved`) and **"Save another"** (resets to idle).
  Calls `router.refresh()` so the list behind the modal updates.
- **Error:** inline destructive message with the mapped reason, the URL preserved,
  **"Try again"**; copy hints that they can also use the extension. `role="alert"`.

Interaction & a11y: every button `cursor-pointer` (inherited Button states: hover,
active translate, `disabled:opacity-50`, `focus-visible` ring), Dialog focus-trap +
`Esc` to close (aborting any in-flight request), labelled title/description,
`prefers-reduced-motion` respected (base-ui `data-open`/`data-starting-style`
transitions kept subtle; spinner still shown). No layout shift between states.

## Out of scope (YAGNI)

- Manual-entry fallback form (if extraction fails, the error nudges to retry / use the
  extension). Can be added later.
- Bulk/multi-URL import, crawling a careers page, monitoring.
- Re-using context.dev for logos (Branding chosen instead per the logo decision).
- Forwarding the AI-prep flag (separate, extension-only boundary).

## Testing / verification

- **Live Firecrawl smoke** during impl: run `importJobFromUrl` (or a curl) against 2–3
  real postings — a Greenhouse/Lever/Ashby posting (likely *has* an inline form →
  questions populated) and a LinkedIn/Indeed posting (no inline form → empty
  questions, details only) — and confirm the saved `Job` shape + `logoUrl` guardrail.
- **`./scripts/smoke-test.sh`** still passes (existing CRUD path unchanged).
- **Pure-unit checks** for the mapper: null→undefined coercion, the aggregator logo
  guardrail, type coercion via `normalizeApplicationQuestions`.
- **Manual UI pass** via `npm run dev`: idle→loading→success and the error path;
  keyboard + reduced-motion.
- `npm run lint` / typecheck clean.

## Subtasks (build order)

1. Env + `lib/llm/firecrawl.ts` client (+ verify the live `json`+`branding` request/response shape).
2. `lib/llm/job-import-extraction.ts` — schema, prompt, and output→our-shape mapper (pure).
3. `lib/server/job-import.ts` — `importJobFromUrl` orchestration → `createJob`.
4. `lib/validations/job-import.ts` + `app/api/jobs/import/route.ts`.
5. `components/ui/dialog.tsx` (base-ui wrapper).
6. `components/dashboard/import-job-dialog.tsx` + wire the sidebar button & empty-state CTA + refresh on success.
7. Verify end-to-end against real postings; lint/typecheck; update project MD docs.

## Implementation notes / deviations (2026-06-23)

What changed versus the design during the build, with the reasons:

- **Logo = Firecrawl `branding`, not context.dev** (user's call). `pickLogoUrl` takes
  `branding.logo`/`images.logo`. The live API returns `images.logo` as a **`data:` URI inline
  SVG** for some sites, so the guard rejects non-`http(s)` URLs (also keeps under the 2000-char
  `logoUrl` cap). The aggregator guard was **simplified to page-host suppression**: if the
  posting host is a chrome-heavy aggregator (LinkedIn/Indeed/Glassdoor/…) we drop the logo
  entirely (that page's brand is the *site's*, not the company's); embedded ATS boards
  (Greenhouse/Lever/Ashby) are trusted. `logoUrl` is stored but **not yet rendered on cards**
  (pre-existing gap) — the success modal shows it (with initial-tile fallback). Rendering stored
  logos app-wide is a follow-up.
- **Timeouts raised.** Measured real scrapes at **50–95s** on JS-heavy Greenhouse pages (one
  cold attempt hit the initial 60s cap). Client now budgets `API_TIMEOUT_MS = 100s` /
  `FETCH_TIMEOUT_MS = 115s`; the route sets `maxDuration = 120` for production. A Firecrawl
  `SCRAPE_TIMEOUT` maps to a clean retryable 400.
- **Anti-hallucination guard added (important).** Initial testing showed `https://example.com`
  (no posting) produced a **fabricated** job whose application questions were copied verbatim
  from the prompt's few-shot example. Fixed by hardening the prompt: an explicit "NOT A JOB
  POSTING → null title/company, empty questions" rule and labeling the example as fictional /
  never-copy. Re-verified: `example.com` → 400, real posting → 201 with questions.
- **Verification done:** live Firecrawl extraction (Greenhouse, 18 then 12 real questions — LLM
  non-determinism, both correct), offline `createJobSchema.parse` + logo-guardrail unit checks,
  full route e2e (201 happy path, dedup-by-URL returns same id, non-posting 400, invalid-URL
  400), `npm run typecheck` + `eslint` clean on all new files, `/dashboard` + `/dashboard/saved`
  SSR 200. The interactive modal visuals weren't auto-driven (Playwright profile was locked) —
  confirm in-browser.
- **No new dependency:** raw `fetch` Firecrawl client (matches `groq.ts`); modal built on a new
  `@base-ui/react/dialog` wrapper (`components/ui/dialog.tsx`).

## Addendum — split posting/application URLs (2026-06-23)

Some ATSs put the job details and the application form on **different URLs/routes** (e.g. Ashby:
`…/<id>` for the role, `…/<id>/application` for the form). A single scrape captures one rendered
DOM, so it can return only one side. Added a manual "add the other URL" recovery UX rather than a
brittle auto-click or a heavier crawl.

**Contract change.** `POST /api/jobs/import` now returns a **discriminated result** (200) instead
of always the saved job:
- `{ outcome: "saved", job }` — details found; saved (with any questions on the page).
- `{ outcome: "application_only", questions }` — an apply form with no job identity; nothing saved.
- neither → `400` (unchanged non-posting guard).

It also accepts optional `carryQuestions` — questions from a prior `application_only` result,
re-validated server-side and attached to the job created from the posting URL (the posting page's
own questions win if it has any).

**New endpoint.** `POST /api/jobs/:id/application` `{ url }` scrapes a second URL with an
**application-only** config (`APPLICATION_IMPORT_SCHEMA` / `APPLICATION_IMPORT_PROMPT` — same
form-reading rules, but no job-posting gate so a bare apply page isn't suppressed) and **upserts**
the questions onto the saved job via `updateJob` (status/other fields untouched).

**Prompt change.** `JOB_IMPORT_PROMPT` gained an **apply-page carve-out**: a page that is one job's
apply form (a form, but maybe no description) must return its `applicationQuestions` with null
title/company — it is *not* the "not a job posting" case. The fabrication guard is unchanged
(`example.com` → 400).

**UX.** `ImportJobDialog` adds two partial-result views, both using a shared inline `SecondaryImport`
sub-form (own URL validation, abortable busy state, inline error, button spinner):
- *saved with no form* → "No application questions found — paste the apply page" → attach endpoint.
- *application_only* → "Add the job posting" (shows "N questions ready to attach") → re-import with
  `carryQuestions`.

**Verified end-to-end (live, Ashby OpenAI role):** base URL → `saved`, no form; `…/application` →
complete `saved` job + **14 questions** (Ashby's apply page repeats the header); attach
`…/application` onto the bare base job → **14 questions, status preserved**; `example.com` → 400.
`typecheck` + `eslint` clean.
