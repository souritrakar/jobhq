# Profile-sourced autofill — design

**Date:** 2026-06-28
**Status:** Implemented (2026-06-28) — server-side in `lib/server/autofill.ts`, EEO included, extension unchanged. Tests in `lib/server/autofill.test.ts`.

## Problem

One-click Autofill currently fills a live application page only from the **saved
per-job application answers** (`buildAutofillPlan`, `webapp/lib/server/autofill.ts`).
Common identity fields a user types on almost every application — name, email,
phone, address, profile links — are not covered unless they happened to be saved as
per-job questions. The user maintains those standing values once in their
**autofill profile** (`UserProfile`, surfaced at `/dashboard/settings`), and wants
Autofill to use them.

### The efficiency concern (resolved)

The motivating worry was cost: fetching the profile on every page load or every
Autofill click would be wasteful, and caching it in the extension reintroduces a
stale-data problem when the user edits their profile.

**Resolution: do it server-side.** Autofill already round-trips to the server
(`POST /api/jobs/:id/application/autofill-match` → `buildAutofillPlan`), and that
request already reads the DB and runs embeddings. Reading the profile there is a
single indexed `findUnique` — negligible next to work already happening — needs
**no extra request**, keeps **zero profile state in the extension**, and is
**always fresh**. The extension does not change. There is no cache, therefore no
cache-invalidation problem.

## Goals

- Autofill standing identity/contact fields from the user's saved profile.
- No new network round-trips; no profile caching in the extension.
- Zero regression to existing per-job answer autofill behavior.
- Reuse the existing embedding matcher and choice-resolution logic.

## Non-goals (v1)

- **Placeholder override.** If a per-job application *question* exists but is
  unanswered, Layer 1 fills a typed placeholder (`isDefault: true`) and claims that
  field. A real profile value will **not** override that placeholder in v1. (This is
  a deliberate deferral — it needs cross-source conflict resolution for a narrow
  case. Revisit later.)
- No changes to the extension message flow, `apiFetch`, the route handler, or the
  profile schema/API.
- No new UI required. Optional polish (badging profile-sourced fills) is listed
  under Future work, not built here.

## Architecture

All changes are contained in `webapp/lib/server/autofill.ts`. The matcher
(`webapp/lib/application/field-matching.ts`) is reused **unchanged**.

### Two-layer matching

`buildAutofillPlan(userId, jobId, fields)` runs two passes over the page's
harvested fields:

1. **Layer 1 — per-job answers (existing, unchanged).** Saved application questions
   match to page fields via `matchQuestionsToFields`. Each matched field gets the
   saved answer, or a typed placeholder (`isDefault: true`) when unanswered. These
   fields are now **claimed**.

2. **Layer 2 — profile (new).** The page fields *not claimed by Layer 1* are matched
   against the user's profile. Each non-empty profile field is turned into a
   pseudo-`QuestionDescriptor` (`{questionId: "profile:email", label: "Email", ...}`)
   and fed into the **same** `matchQuestionsToFields` call, so embedding-based label
   variance handling ("Email" / "E-mail address" / "Work email") comes for free.
   `resolveChoice` handles choice fields (e.g. work authorization) exactly as it
   does for answers.

Precedence — **saved per-job answer > profile value** — falls out of ordering:
Layer 1 claims first, Layer 2 only sees leftover fields. No conflict-resolution
code is needed.

### Data flow

```
extension (unchanged)
  → POST /api/jobs/:id/application/autofill-match  (route unchanged)
    → buildAutofillPlan(userId, jobId, fields)
        Layer 1: getJob + getApplicationAnswers → matchQuestionsToFields → claims fields
        Layer 2: getProfile(userId) → profilePseudoQuestions(non-empty)
                 → matchQuestionsToFields(pseudoQs, unclaimedFields) → fills rest
        merge → AutofillPlan
```

`getProfile` already exists (`webapp/lib/server/profile.ts`) and is userId-scoped.

## Components

### `PROFILE_AUTOFILL_FIELDS` (new, in `lib/server/autofill.ts`)

An ordered map from profile key → `{ label, type }`, defining which profile fields
participate and the natural-language label embedded for matching. `type` is an
`ApplicationFieldType` so `resolveChoice` / `defaultValueForType` and the
text-vs-choice fill logic apply uniformly.

Proposed set (trimmable):

| pseudo-question | source | label (embedded) | type |
| --- | --- | --- | --- |
| `profile:fullName` | `firstName`+`lastName` (synthesized) | "Full name" | short_text |
| `profile:firstName` | `firstName` | "First name" | short_text |
| `profile:lastName` | `lastName` | "Last name" | short_text |
| `profile:preferredName` | `preferredName` | "Preferred name" | short_text |
| `profile:email` | `email` | "Email address" | short_text |
| `profile:phone` | `phone` | "Phone number" | short_text |
| `profile:streetAddress` | `streetAddress` | "Street address" | short_text |
| `profile:addressLine2` | `addressLine2` | "Address line 2" | short_text |
| `profile:city` | `city` | "City" | short_text |
| `profile:state` | `state` | "State / Province" | short_text |
| `profile:postalCode` | `postalCode` | "Postal / ZIP code" | short_text |
| `profile:country` | `country` | "Country" | short_text |
| `profile:linkedinUrl` | `linkedinUrl` | "LinkedIn profile URL" | short_text |
| `profile:portfolioUrl` | `portfolioUrl` | "Portfolio / website URL" | short_text |
| `profile:githubUrl` | `githubUrl` | "GitHub profile URL" | short_text |
| `profile:currentTitle` | `currentTitle` | "Current job title" | short_text |
| `profile:currentCompany` | `currentCompany` | "Current company" | short_text |
| `profile:workAuthorization` | `workAuthorization` | "Work authorization" | (choice) |

Notes:
- The actual `ApplicationFieldType` values must be taken from
  `lib/llm/application-extraction.ts` — the table above is indicative.
- `fullName` is synthesized from first + last and only emitted when at least one is
  present; first/last are also emitted individually so split-name and single-name
  forms both fill.
- EEO self-ID fields (gender, raceEthnicity, veteranStatus, disabilityStatus) are
  candidates but are sensitive choice fields — decide during implementation whether
  to include in v1. Default: include, since they appear on real application forms
  and the user opted into storing them.
- **Empty values are skipped** — a blank/`null` profile field produces no
  pseudo-question and never claims a page field.

### `profilePseudoQuestions(profile)` (new helper)

Maps a `ProfileSettings` object → `ServiceQuestion[]` using
`PROFILE_AUTOFILL_FIELDS`, skipping empty values, synthesizing `fullName`. Pure and
unit-testable.

### `AutofillInstruction.source` (additive field)

Add `source: "answer" | "profile"` to `AutofillInstruction`
(`webapp/lib/server/autofill.ts`). Layer 1 → `"answer"`, Layer 2 → `"profile"`.
Profile fills are real values, so `isDefault: false`. Purely additive — the current
extension ignores unknown fields, so **no extension change is required**.

## Error handling

- No saved profile (`getProfile` returns `null`) → Layer 2 is skipped; behavior is
  identical to today.
- Profile read failure → should not break per-job autofill. Layer 2 is best-effort:
  on error, log and return the Layer-1 plan. (Layer 1 failures propagate as today.)
- All matching already degrades gracefully: a profile field with no good field match
  is simply not filled (it is not surfaced in `unmatched` — `unmatched` remains
  per-job-questions only, preserving its current meaning for the modal).

## Testing

- `profilePseudoQuestions`: unit tests — empty-skipping, fullName synthesis,
  full-vs-split name, choice field passthrough.
- `buildAutofillPlan` with a fake `getProfile` + stub `embed` (mirroring existing
  field-matching tests):
  - per-job answer wins over profile for the same field (precedence),
  - profile fills a field with no per-job question,
  - no profile → output identical to current behavior (regression guard),
  - empty profile fields claim nothing,
  - `source` is set correctly per layer.

## Future work (not in this change)

- Placeholder override (profile value beats an unanswered per-job placeholder).
- Extension modal: badge/label profile-sourced fills distinctly from saved answers.
- Enable the deterministic `directMatch` pre-pass for exact-label identity fields to
  save embedding work.
