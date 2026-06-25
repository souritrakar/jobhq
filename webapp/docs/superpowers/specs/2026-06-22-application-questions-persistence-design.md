# Persisting extracted application questions

**Date:** 2026-06-22
**Status:** Approved, in implementation

## Problem

The extension now optionally extracts a job posting's **application form questions**
(via `POST /api/extract-application` → Groq). Today those questions only live in the
extension's `chrome.storage.local` cache (key `jt:appq:{url}`) — they are never persisted
to the database. We want to save them per job, **optionally**: if the user didn't extract
application data for a posting, nothing application-related should be written.

The questions must be stored in a shape that is (a) open to any question type — MCQ,
numeric, file upload, etc. — (b) scalable to thousands of users, and (c) consumable by an
AI step that will run over the questions later.

## Decisions

1. **Dedicated `JobApplication` table, 1:1 (optional) with `Job`.** The application has its
   own lifecycle (extracted separately, optional, re-extractable, will grow AI state later),
   so it's its own aggregate. Keeping it off `Job` keeps the hot job-list read lean.
2. **Questions stored as validated JSONB** (a typed array), not relational rows. The set is
   bounded, always read/written together, heterogeneous by type, and never queried per
   question across jobs — the textbook case for a JSON aggregate. Discipline that keeps it
   safe: validate the shape with Zod at the API boundary and version it (`schemaVersion`).
3. **Optional by construction.** The questions ride along inside the existing `POST /api/jobs`
   create payload as an optional `application` field. Absent/empty → only the `Job` row is
   created; nothing application-related is written. One atomic create (Prisma nested write).
4. **AI-readiness without answer machinery.** Each stored question gets a stable `id` (slug)
   and an `order`, so a later AI step can reference/attach to a specific question. No answer
   or draft columns now (deferred per product decision).

### Scope trims vs. the first sketch (simplicity-first)

Dropped from the originally-sketched model because they are derivable from the parent `Job`
or unavailable at save time, and the JSONB column stays open for additive growth without a
migration:
- `source`, `sourceUrl` — same page as `job.source` / `job.url`.
- `model`, `extractedAt` — the model id isn't carried to the client cache, and `extractedAt`
  would equal `createdAt`. Add later (with provenance threaded through) only if AI work needs it.
- per-question `config` escape hatch — the JSONB column itself is the escape hatch; add the
  field when a type actually needs type-specific data.

## Schema

```prisma
model JobApplication {
  id            String   @id @default(cuid())
  jobId         String   @unique
  job           Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  questions     Json     // validated, typed array (shape below)
  questionCount Int      @default(0)
  flaggedCount  Int      @default(0) // v2: denormalized tally of user-flagged questions
  schemaVersion Int      @default(1) // forward-migration guard (writes now stamp 2 — see v2 note)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId])
  @@map("job_applications")
}
```

Plus `application JobApplication?` on `Job` and `jobApplications JobApplication[]` on `User`.

### Stored question shape (one element of `questions`)

```ts
{
  id: string,        // stable slug per question (derived from label, deduped) — AI handle
  order: number,     // 0-based display order
  label: string,
  type: ApplicationFieldType,   // existing 12 types: short_text…file (mcq=select/radio, numeric=number, upload=file)
  required?: boolean,
  placeholder?: string,
  helpText?: string,
  options?: string[],           // select/radio/multi_select/checkbox only
  flagged?: boolean,            // v2: user-set star — "review this later" (not LLM-produced)
}
```

`ApplicationFieldType` is imported from `lib/llm/application-extraction.ts` so the LLM,
validation, and storage share one source of truth for the allowed types.

### v2 update (2026-06-23) — flag a question for review

Added a per-question `flagged` boolean: the user stars individual questions in the save panel
(a flag toggle, hover-revealed) to mark them for later review. It is **additive and backward
compatible** — old rows simply lack the key. Changes: `flagged?` in the stored shape and in
`applicationInputSchema`; `shapeStoredQuestions` persists it; `JobApplication.flaggedCount`
denormalizes the tally (for future review surfacing / reminders); writes stamp
`schemaVersion = 2`. The flag rides the existing save path (cached in `chrome.storage.local`,
sent in `application.questions`), so no new endpoint or migration of old data is needed —
`prisma db push` adds the `flaggedCount` column with a `0` default.

## Data flow

```
Extension modal (questions extracted & cached in chrome.storage.local)
  └─ "Confirm & Save"
       content.js saveJob: read cached questions for the page URL;
         if any → payload.application = { questions }
       background.js: forward payload.application unchanged
  → POST /api/jobs  { ...jobFields, application?: { questions } }
       createJobSchema validates (application optional; each question typed)
       createJob: if application present → Prisma job.create with nested
         application.create { userId, questions: shaped(+id,+order), questionCount }
         else → plain job.create (nothing application-related written)
  → Postgres: jobs (+ job_applications when present)
```

`updateJob` (PATCH) upserts the application when one is included, so the shared
create/update schema stays coherent and re-extraction replaces the set cleanly.
`getJob` includes the application (single-job view); `listJobs` does **not** (lean hot path).

## Verification (no unit-test runner in repo, per existing convention)

- `npm run typecheck` and `npm run lint` clean.
- `scripts/smoke-test.sh` extended to:
  - create a job **with** `application` → fetch it → assert the questions persisted (with ids/order).
  - create a job **without** `application` → assert no application is attached.

## Out of scope

AI answer/draft storage, per-question answer columns, cross-job question analytics,
extraction-provenance columns. All are additive later thanks to the open JSONB +
`schemaVersion` + per-question `id`.
