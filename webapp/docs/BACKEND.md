# JobTracker Backend

The backend lives **inside the Next.js web app** (`webapp/`) as Route Handlers under
`app/api/`. The Chrome extension and the web app share this one API — there is no
separate backend service.

- **Stack:** Next.js 16 (App Router, Node runtime) · Prisma 7 · Neon Postgres ·
  Zod validation.
- **Why one app:** simplest thing that scales — one deploy, one schema, one auth
  surface. Reminders are now a first-class resource (model + CRUD API, below); the
  background *workers* that fire them (and posting monitoring) will be added later as
  separate processes against the same database — the schema and service layer are
  structured so they drop in cleanly.

## Status (as of 2026-06-18)

**Live and verified end-to-end against Neon.** No setup needed to start hacking:

- Neon project provisioned & connected; real creds + `DEV_USER_ID` are in `.env`
  (gitignored — don't re-provision).
- Schema pushed (`prisma db push`) and seeded (dev user + 2 sample jobs).
- Jobs CRUD (`/api/jobs`), `/api/health`, and a read-only `/dashboard` page all work.

Just run `npm run dev` and hit `/dashboard` or `./scripts/smoke-test.sh`.

**Web app routes:** `/` (landing) · `/dashboard` + `/dashboard/saved` (server components —
read the DB via `lib/server/jobs.ts`, resolve the user with `getServerUserId()`) ·
`/dashboard/jobs/[id]` (the per-job detail page — server-rendered from `getJob`, with the
captured application form rendered as an answer-ready preview; status / notes / delete are
interactive, calling `PATCH`/`DELETE /api/jobs/[id]` from the client and `router.refresh()`ing).
The right rail also carries a **Reminders** card (list + "+ Add reminder"), and a "Remind me"
button sits in the header action cluster — both open the same lightweight popover and persist via
the reminders API (below). `/dashboard/reminders` is the global feed of all reminders.
Clicking a job in the dashboard or saved list navigates here (in-app), not to the original
posting — that stays reachable via "Open original" on the detail page.

**Built but not done:** extension auth (the webapp now uses Neon Auth — see Auth; the extension
still rides the dev `x-user-id` seam), interactive dashboard
(no add/edit UI yet), background workers that *fire* reminders / monitor postings (the reminders
data + CRUD exist; nothing schedules notifications yet). The **Settings page**
(`/dashboard/settings`) is now persisted — a `UserProfile` autofill form saved via
`GET|PUT /api/profile`; see [`SETTINGS.md`](SETTINGS.md).

---

## Architecture: request → response

Every request flows through the same layers. Keep this separation — it's what keeps
the codebase testable and safe as it grows.

```
app/api/**/route.ts      HTTP layer: parse input, call a service, shape the response.
  └─ lib/api/route.ts    withRoute() wrapper: CORS + error-to-JSON envelope.
  └─ lib/auth/*          getUserId(req) — resolves the current user (see Auth).
  └─ lib/validations/*   Zod schemas — the ONLY place input shapes are defined.
  └─ lib/server/*        Service/repository layer: ALL database access, user-scoped.
       └─ lib/db.ts      Shared PrismaClient (Neon adapter).
```

**Rules of thumb**
- Route handlers never touch Prisma directly — they call `lib/server/*`.
- Service functions always take `userId` and scope every query to it (multi-tenant
  safety). A user can never read or mutate another user's rows.
- All input is validated with a Zod schema from `lib/validations/*` before it reaches
  a service. Never trust the request body.
- Throw `ApiError` (`lib/api/errors.ts`) for expected failures (404, 400, …). The
  wrapper converts them to the standard error envelope.

## Response envelope

Success: `{ "data": <payload> }` — status 200 (or 201 on create).
Error:   `{ "error": { "code": "NOT_FOUND", "message": "...", "details"?: ... } }`.

## API endpoints

| Method | Path             | Body / Query                          | Description              |
| ------ | ---------------- | ------------------------------------- | ------------------------ |
| GET    | `/api/health`    | —                                     | Liveness + DB check      |
| GET    | `/api/jobs`      | `?status=&limit=&cursor=`             | List current user's jobs |
| POST   | `/api/jobs`      | `{ title, company, url?, ... }`       | Create a job             |
| PATCH  | `/api/jobs`      | `{ changes: [{ id, status }] }`       | Bulk-move pipeline status (Kanban board batched save) |
| GET    | `/api/jobs/:id`  | —                                     | Get one job              |
| PATCH  | `/api/jobs/:id`  | any subset of job fields              | Update a job             |
| DELETE | `/api/jobs/:id`  | —                                     | Delete a job             |
| POST   | `/api/extract`   | `{ text, source?, url? }`             | LLM-extract job fields   |
| POST   | `/api/extract-application` | `{ text, source?, url? }`   | LLM-extract application questions |
| POST   | `/api/extract/tiered` | `{ signals: { jsonLd, meta, segments, h1?, titleHint? }, source?, url? }` | NON-LLM job fields (structured data + embeddings) |
| POST   | `/api/extract-application/tiered` | `{ fields: [{ id, label, kind, inputType?, options?, required? }], source?, url? }` | NON-LLM application questions (DOM harvest + embeddings gate) |
| POST   | `/api/jobs/import` | `{ url, carryQuestions? }`          | Save a job from a posting URL (web app, no extension) |
| POST   | `/api/jobs/:id/application` | `{ url }`                   | Attach a separate apply page's form to a saved job |
| PUT    | `/api/jobs/:id/application/answers` | `{ answers: [{ questionId, value }] }` | Batch save (or clear) the changed answers |
| POST   | `/api/jobs/:id/application/draft` | `{ questionId }`       | AI-draft one question's answer (JSON, not a stream) |
| POST   | `/api/jobs/:id/application/autofill-match` | `{ fields: [{ id, label, kind, options? }] }` | Match saved answers → the live page's input fields (extension Autofill) |
| GET    | `/api/jobs/:id/reminders` | —                          | List a job's reminders   |
| POST   | `/api/jobs/:id/reminders` | `{ title, dueAt?, hasTime? }` | Create a reminder for a job |
| POST   | `/api/reminders` | `{ title, dueAt?, hasTime? }`          | Create a standalone reminder (no job) |
| PATCH  | `/api/reminders/:id` | `{ done?, title?, dueAt?, hasTime? }` | Update a reminder (toggle done / edit) |
| DELETE | `/api/reminders/:id` | —                                  | Delete a reminder        |
| POST   | `/api/cover-letter` | `{ jobId, resumeId?, instructions? }` | Stream a tailored cover letter (text stream, not JSON) |
| GET    | `/api/documents` | —                                      | List current user's documents |
| POST   | `/api/documents` | multipart: `file`, optional `title`    | Upload a document        |
| DELETE | `/api/documents/:id` | —                                  | Delete a document (metadata + bytes) |
| GET    | `/api/documents/:id/raw` | `?download=1`                  | Stream a document's bytes (other features fetch this) |
| GET    | `/api/profile`   | —                                      | Current user's autofill profile (or `null`); also the extension's autofill source |
| PUT    | `/api/profile`   | any subset of `ProfileSettings` fields | Create/replace the user's autofill profile |

Job fields: `title`, `company`, `url`, `location`, `description`, `source`,
`salary`, `employmentType`, `workplaceType`,
`status` (`SAVED|APPLIED|INTERVIEWING|OFFER|REJECTED|ARCHIVED`), `deadline` (ISO
date), `notes`, `resumeDocumentId` (the user's chosen resume for this job — a `Document`
id, or `null` to clear; ownership is verified service-side, FK is `onDelete: SetNull`),
and an optional `application`. See `lib/validations/job.ts` for exact constraints.

**Optional application form (`application`)** — when the user opts to extract a posting's
application questions, the extension includes `application: { questions: [...] }` in the
create payload. Each question is `{ label, type, required?, placeholder?, helpText?,
options?, flagged? }` where `type` is one of the 12 `APPLICATION_FIELD_TYPES`
(`lib/llm/application-extraction.ts`). `flagged` is a **user-set** star (not produced by the
LLM) marking a question for later review. It is **optional by construction**: omit it (or send
an empty `questions` array) and nothing application-related is written. When present, it is
stored 1:1 in `JobApplication` as a validated JSON array — the service assigns each question
a stable `id` (slug) and `order`, and records `questionCount`, `flaggedCount` (denormalized
tally of flagged questions, for review/reminders), and `schemaVersion` (now **2** — added
`flagged`). `GET
/api/jobs/:id` includes the application; the list endpoint omits it (lean hot path). PATCH
upserts it (re-extraction replaces the set). The questions JSON is stored open-endedly so the
AI answer step (below) reads them (by `id`) to draft answers without a schema migration.

### Application answers + AI draft

The job detail page's application form is **live**, not a preview: text answers are persisted and
long-answer fields offer an AI draft. Two pieces:

**Answers persist in their OWN table, not in the questions JSON.** `JobApplicationAnswer`
(`prisma/schema.prisma`) is one row per answered question — `(applicationId, questionId)` unique,
plus `value` and a denormalized `userId`. This is a deliberate split: the `questions` JSON is the
rarely-changing form STRUCTURE; answers are the frequently-edited VALUES.

**Saving is manual + batched, not autosave.** Editing (or an AI draft) only mutates client-side
draft state; nothing is written until the user clicks **Save changes** in the bottom save bar. That
sends only the changed answers in ONE request (`PUT /api/jobs/:id/application/answers`
`{ answers: [{ questionId, value }] }` → `lib/server/application-answers.ts#saveApplicationAnswers`),
persisted as a single `prisma.$transaction`: non-empty values **upsert**, empty values **delete**
(clear). One transaction per Save keeps writes cheap and scalable, never rewrites the whole question
blob, and has no read-modify-write race between fields. The service verifies every `questionId`
belongs to that job's form before writing — a bogus id rejects the whole batch (the transaction
rolls back, so a valid sibling answer is left untouched). The page loads all of a form's answers in
one indexed query (`getApplicationAnswers`) and seeds the controls; `GET /api/jobs/:id` also
includes `application.answers` so the extension can populate the read-only view. The UI persists
**text-entry** fields (textarea + single-line typed inputs) AND **choice** fields
(`select`/`radio`/`checkbox`/`multi_select` + the bare consent checkbox) — the choice controls are
controlled and flow through the same `{ questionId, value }` save path. The single `value` column
encodes the answer per the shared `lib/application/answer-codec.ts`: single-value answers store the
chosen option as a plain string; multi-value answers (`checkbox`/`multi_select`) store a JSON string
array (e.g. `["Remote","Hybrid"]`), read back by the question's `type`. Only **file** fields remain a
preview (out of scope: not persisted or autofilled).

**AI draft** (`POST /api/jobs/:id/application/draft` `{ questionId }` →
`lib/server/answer-draft.ts`) writes a first-person answer to ONE question, grounded in the job +
the user's selected resume. It is offered **only on the textarea type** (`long_text`) — the
deterministic gate `canAiDraft` (`components/dashboard/job-detail/questions.ts`) excludes name
(short_text), email/phone (their own types), every non-typing field, and any identity/contact label;
the server guards independently (`NON_DRAFTABLE_TYPES`). **A resume is required** — the draft is
grounded in its text, so both the button (disabled with a tooltip) and the server (400) gate on the
job's `resumeDocumentId` (chosen in the rail's Resume card).

- **Provider: OpenRouter, non-streaming.** Unlike the cover letter (a live stream), a drafted answer
  comes back as the normal `{ data: { value } }` JSON envelope. Not streaming is deliberate: the
  request either resolves with the whole answer or rejects/times out — there's no open stream to
  stall, so the "generating forever" failure mode can't happen. `lib/llm/openrouter.ts` caps output
  (`AI_DRAFT_MAX_TOKENS`, default 600 ≈ a few paragraphs) and bounds wall-clock with an
  AbortController; the client passes its own AbortSignal (abort on unmount/repeat). Model is a
  fallback CHAIN (`AI_DRAFT_MODEL` then `AI_DRAFT_FALLBACK_MODELS`, default Gemini 3.5 Flash →
  Gemini 3.1 Flash Lite → GLM 4.7 Flash) so a not-yet-live primary self-heals via OpenRouter routing.
- **Prompt caching for many questions.** `lib/llm/answer-draft.ts` splits the prompt so the static
  instructions and the per-application job+resume block carry `cache_control` breakpoints, while the
  question is the only varying tail. Drafting a second question in the same application reuses the
  cached instructions+job+resume prefix and only re-bills the question — the cost win for a long form.
- **Quality bar.** First-person, grounded ONLY in the resume + posting (hard no-fabrication rule),
  human voice with the role's vocabulary, **no em dashes** (instructed and stripped deterministically
  in `cleanDraftedAnswer`), and output is the bare answer (no preamble/markdown/quotes/placeholders).
- **No usage logging yet** (the cover letter doesn't either) — a `DraftLog` could follow if cost
  tuning needs it.

### Application autofill (extension)

The extension's one-click **Autofill** fills a live application page from the job's saved answers,
without an LLM page-scan or per-site selectors. Flow: the extension harvests the page's fillable input
fields (deterministic, in `extension/ui/application.js` — robust ARIA/HTML label resolution, radios/
checkboxes grouped by `name`, sends only labels/kinds/option-labels) and posts them to
`POST /api/jobs/:id/application/autofill-match` `{ fields }`. The server matches each **saved question
→ its field on the page** (direction matters: a page/application that changed since saving degrades
gracefully) and returns a plan
`{ matched: [{ questionId, fieldId, value, optionValues, isDefault, source, score }], unmatched: [{ questionId, label }] }`.
The extension then fills each field deterministically (native value setters + dispatched events so
React/Vue register), highlights filled fields (fern = saved answer, dashed amber = placeholder), and
offers **Undo**; `unmatched` questions surface in an in-page result card.

- **Semantic match, not string match.** `lib/server/autofill.ts` loads the questions (`getJob`) +
  answers (`getApplicationAnswers`, reloaded server-side — the request carries no answer values), then
  `lib/application/field-matching.ts` embeds both sides (`lib/llm/embeddings.ts`, OpenAI
  `text-embedding-3-small`, `OPENAI_API_KEY` server-side only) and runs an in-memory cosine + greedy
  one-to-one assignment with a confidence floor. No vector DB — it's a one-shot ≤N×≤M match.
- **The embedder is the single swap seam.** `embed(texts)` is the only place the provider is named;
  moving to a self-hosted FastEmbed service later is a one-file change.
- **Deterministic direct-match is written but disabled.** `directMatch` (exact normalized labels) is
  implemented and commented out at the call site; the intended future pipeline is "direct first,
  embeddings for the leftovers." Today it's pure embeddings.
- **Two layers: per-job answers, then profile.** `buildAutofillPlan` runs Layer 1 (saved per-job
  answers → fields, as above) first; those fields are **claimed**. Layer 2 then matches the page fields
  Layer 1 *didn't* claim against the user's standing **autofill profile** (`getProfile`) — each non-empty
  profile field (name, email, phone, address, links, work auth, EEO self-ID, …) becomes a pseudo-question
  (`PROFILE_AUTOFILL_FIELDS` in `lib/server/autofill.ts`) fed through the **same** embedding matcher. Each
  instruction carries `source: "answer" | "profile"`. Precedence (saved answer > profile) falls out of
  ordering — no conflict-resolution code. The profile read is best-effort: a failure logs and leaves the
  Layer-1 plan intact. **Not done in v1:** a profile value overriding a Layer-1 *placeholder* (an
  unanswered per-job question still wins its field as a placeholder).
- **No saved answer → typed default.** A per-job question with no answer is filled with a
  `defaultValueForType` stand-in (flagged `isDefault`, highlighted distinctly). Standing identity values
  now come from the profile (Layer 2) for fields without a per-job question. **Files are out of scope**
  (never harvested, persisted, or filled).
- **Choice resolution stays deterministic.** For a matched dropdown/radio/checkbox, `resolveChoice`
  maps the saved answer to the page's actual option value(s) by normalized match (the embedding
  fallback there is written but disabled).

### Reminders

Follow-up nudges, created from the job detail page (rail card or header "Remind me" button) or
the global Reminders page. A `Reminder` (`prisma/schema.prisma`) is intentionally thin: `title`
(free text), `type` (`USER` today; `SYSTEM` reserved for future auto-nudges), `dueAt?` +
`hasTime` (date-only vs. a set time-of-day), `done`, and an **optional** `jobId` — most reminders
are about a posting, but standalone ones are allowed (the global feed renders both). Company /
role / logo are **not** stored; they're read from the linked job, so there's nothing to attach by
hand. Deleting a job cascade-deletes its reminders.

- Service `lib/server/reminders.ts` (all `userId`-scoped): `listReminders` (global feed, newest
  first), `listJobReminders` (one job — open before done, then soonest `dueAt` nulls-last),
  `createReminder` (verifies the job belongs to the user when `jobId` is set), `updateReminder`,
  `deleteReminder`, and `toClientReminder` — the single serializer mapping a Prisma row to the
  client `Reminder` shape (`lib/reminders/types.ts`), shared by the feed, the rail card, and the
  browser helpers (`lib/reminders/client.ts`).
- Validation in `lib/validations/reminder.ts`; `dueAt` is coerced from an ISO string like
  `job.deadline`. UI mutations are optimistic, then `router.refresh()` reconciles with the server.
- The global `/dashboard/reminders` page reads `listReminders` directly (server component); the
  feed groups by `createdAt` and surfaces the due-date label when present.

**Delivery (reminders actually fire).** See [`docs/REMINDERS.md`](REMINDERS.md) for the full
architecture. In short:

- A dated, not-done reminder is scheduled on create/update via **Upstash QStash** (one-shot
  `publishJSON` with `notBefore`); the message id is stored on the row so an edit/delete can
  cancel or reschedule it (`lib/reminders/scheduler.ts`, wired into the service).
- `POST /api/reminders/fire` is the **QStash-signed worker** (NOT `withRoute`; uses
  `verifySignatureAppRouter`). It calls `fireReminder` (`lib/server/reminder-delivery.ts`), whose
  atomic `updateMany ... WHERE deliveredAt IS NULL AND NOT done` claim makes a QStash retry a
  no-op (at-most-once). It then fans out to channels (`lib/server/notification-dispatch.ts`):
  **email** (Resend, `lib/email/*`), **in-app** (a `Notification` row), and the **extension**
  delivers locally (no server push).
- `SYSTEM` reminders are auto-generated: an **interview** reminder per job, kept in sync with
  `Job.interviewAt` (24h lead) via `upsertInterviewReminder` and a `@@unique([jobId, systemKey])`
  guard (`lib/server/system-reminders.ts`).
- `GET /api/reminders` — full list, or `?upcoming=1&days=30` for not-done reminders due in the
  next N days (the extension's local-alarm sync reads this).
- `GET /api/reminders` aside, `POST /api/reminders` creates a standalone reminder; per-job CRUD is
  `GET|POST /api/jobs/:id/reminders` and `PATCH|DELETE /api/reminders/:id`.

**Cron:** `POST /api/cron/reminders-digest` (QStash-signed) runs a **daily** "jobs needing
attention" digest — every user with `SAVED` jobs untouched ≥ 3 days gets one in-app + email
summary. v1 uses **hardcoded defaults** (no per-user `NotificationPreference` yet — that table
exists but is unused; `resolveChannels(null)` defaults all channels on). Register the schedule
once per environment with `npm run qstash:setup`.

### Notifications

In-app notification surface for fired reminders + the digest. A `Notification`
(`prisma/schema.prisma`) is `userId`-scoped with `kind` (`REMINDER_DUE|INTERVIEW|DIGEST`),
`title`, optional `body`/`href`, an optional `reminderId` (SetNull) + `jobId`, and `readAt`
(null = unread).

- Service `lib/server/notifications.ts`: `createNotification`, `listNotifications`,
  `unreadCount`, `markRead`, `markAllRead`, and `toClientNotification` (the serializer →
  `lib/notifications/types.ts`; browser helpers in `lib/notifications/client.ts`).
- Routes: `GET /api/notifications` (newest first), `PATCH /api/notifications/:id` (mark one read),
  `POST /api/notifications/read-all`.
- The dashboard header **bell** (`components/dashboard/notifications-bell.tsx`) is server-seeded
  (the dashboard layout fetches `listNotifications` + `unreadCount`) and revalidates on window
  focus + dropdown open — deliberately **no polling**.

### Documents

User-uploaded files (resumes, cover letters, …) — the app is deliberately agnostic about what a
document *is*; it's a file with a title. Surfaced at `/dashboard/documents` (sidebar "Documents"):
upload (drag-drop or browse), list, download, delete, with blank/loading/error states.

- **Split storage (Neon's recommended pattern).** Neon is Postgres — it has no bucket storage of
  its own. So the file **bytes** live in an external object store and the **metadata** lives in the
  `Document` row (`prisma/schema.prisma`): `title`, `fileName`, `mimeType`, `size`, `storageKey`
  (opaque address for the bytes), `storageProvider` (which backend holds them). All access is
  `userId`-scoped, and a specific document is always fetched by both `id` and `userId`.
- **The storage seam — Cloudflare R2 (S3-compatible).** Everything talks to the `DocumentStorage`
  interface in `lib/server/storage/document-storage.ts` (`put` / `get` / `delete`). The active
  provider is **Cloudflare R2** via the `@aws-sdk/client-s3` client (R2 has no separate data-plane
  SDK — it implements the S3 protocol; we just point `endpoint` at
  `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` with `region: "auto"`). `documentStorage()`
  activates R2 when `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME`
  are all set (server-side only — never in the client/extension bundle); otherwise it falls back to
  a stub that throws a clear "storage isn't set up yet" error on `put`/`get` so uploads fail loudly,
  never silently. Swapping to another S3-compatible backend (AWS S3 / B2 / …) is just different env
  values; a non-S3 backend is a new class implementing the same interface. The service
  (`lib/server/documents.ts`) stores bytes **before** writing the row, so a storage failure never
  leaves a dangling metadata row.
- **Private bucket, no public/presigned URLs.** The R2 bucket stays fully private — we deliberately
  do NOT use presigned upload/download URLs or a public base URL. Bytes are written and read only
  server-side through the `userId`-scoped API, so a user can only ever reach their own files and
  there are no bearer-token URLs that could leak. Object keys are namespaced
  `documents/<userId>/<uuid>/<filename>` so they can't collide or be guessed. No bucket CORS config
  is needed (the browser never talks to R2 directly). The Cloudflare *API* token (`cfat_…`) is not
  used by the app — only the S3 access key/secret.
- **Validation** (`lib/validations/document.ts`, shared by client + server): allowed types are PDF,
  DOC, DOCX, RTF, ODT (checked by **extension**, since browsers report MIME inconsistently — e.g. a
  .docx often arrives as `application/octet-stream`); max 10 MB. The client pre-validates for UX;
  the server (`POST /api/documents`) re-validates authoritatively.
- **Reading a document elsewhere.** `GET /api/documents/:id/raw` streams the bytes (inline, or
  `?download=1` to force a save). `toClientDocument` attaches this as `url` on every document, so
  any other feature (e.g. a future AI step reading the user's resume) just fetches that URL —
  it never needs to know the storage backend.
- **Text is extracted ONCE, at upload, and stored.** The `Document` row carries `extractedText`
  (+ `textStatus`: `PENDING|READY|EMPTY|UNSUPPORTED|FAILED`, and `extractedAt`). `createDocument`
  parses the bytes right after storing them (`deriveDocumentText` → `resume-text.ts`) and persists
  the plain text, so every later AI use reads it straight from Postgres — the bytes are never
  re-downloaded from R2 or re-parsed. A document's bytes never change (a new upload is a new row),
  so the text is immutable and needs no invalidation. `getDocumentText(userId, id)` is the reader:
  it returns the stored text (or `null` for anything but `READY`), and lazily backfills any legacy
  `PENDING` row (uploaded before this existed) on first read. `listDocuments` uses an explicit
  `select` (`DOCUMENT_META_SELECT`) so a list never drags the ~12 KB text column per row.

### Extraction (`POST /api/extract`)

The extension captures the posting's readable page text (generic — no per-site parsing)
and sends it here. The server makes **one** Groq call (`lib/llm/*`, key in `GROQ_API_KEY`
— **server-side only**, never in the extension bundle) that reads the whole posting and
returns every field plus the cleaned description as a single JSON object, normalizes it,
and returns `{ data: { fields, description?, usage } }`.

`GROQ_MODEL` (default `openai/gpt-oss-20b`) runs in JSON mode at temperature 0, with
`reasoning_effort: "low"` (GPT-OSS bills reasoning as output, so low keeps the JSON
deterministic and off the `max_tokens` budget), and returns `title`, `company`,
`location`, `salary`, `employmentType`, `workplaceType`, and `description`.
`normalizeExtractedFields()` is a thin safety net: it keeps only those keys, trims
values, and drops empty/sentinel values (so a hallucinated `"null"`/`"N/A"` can't leak).
The cleaned `description` is split out of the result and returned alongside `fields`.

**Prompt caching (the page is the cached prefix).** GPT-OSS is cache-eligible on Groq,
and both extraction prompts are laid out so the captured page is the *shared cached
prefix*: render order is `system → user`, and the prompt is
`[SHARED_EXTRACTION_SYSTEM] + [pageBlock(page)] + [task-specific instructions]` — the
system text and `pageBlock()` are single-sourced in `extraction.ts` and imported by
`application-extraction.ts`, so the prefix is **byte-identical** across the details and
application calls; only the wording after the page differs. On a single-page posting
(Greenhouse-style), the details call writes the page to cache and the application call
on the same posting **reads** it at 50% off — and cached input tokens don't count toward
Groq's per-minute (TPM) limit. A different/changed page just misses the cache (same cost
as before), so it degrades gracefully — no detection or gating needed. The seam is best-
effort; `lib/llm/groq.ts` surfaces `usage.cachedInputTokens` and the services log a cache
hit. **Keep `SHARED_EXTRACTION_SYSTEM` and `pageBlock()` identical across both modules —
any drift silently breaks the cache.**

This is deliberately simple — no per-site scoping, no second model, no deterministic
backstops. Each call writes one `ExtractionLog` row (token counts, context size, latency,
success) for cost/perf tuning. All DB access is `userId`-scoped.

### Application-question extraction (`POST /api/extract-application`)

A sibling of `/api/extract` for the posting's **application form** rather than its details.
The extension captures the rendered form (user-triggered — see the extension docs) and posts
the text; the server makes **one** Groq call (`lib/llm/application-extraction.ts`) that returns
the form's questions as a typed array, normalizes it, and returns
`{ data: { questions, usage } }`. Each question is `{ label, type, required?, placeholder?,
helpText?, options? }` where `type` is one of the 12 `APPLICATION_FIELD_TYPES`.
`normalizeApplicationQuestions()` clamps counts/lengths, coerces `type` to the allowed set,
drops labelless entries, and keeps `options` only for choice types. It shares the same
page-first prompt layout as `/api/extract`, so when both run on the same posting/DOM this
call **reads** the page from Groq's cache instead of re-paying for it (see the prompt-caching
note above). Like `/api/extract` it writes one `ExtractionLog` row and is `userId`-scoped.
**Answers are not handled here** — the
extension renders the questions as fillable controls only; persisting the *questions* with a
job is via the optional `application` field on `POST /api/jobs` (above).

### Tiered (non-LLM) extraction (`POST /api/extract/tiered` + `/api/extract-application/tiered`)

A **drop-in, plug-and-play alternative** to the two Groq routes above that uses deterministic
structured-data parsing + embeddings instead of a generation model — cutting token cost to ~zero
and latency to a structured-data parse plus (at most) one cheap embeddings batch. It lives in
`lib/extraction/*`, returns the **exact same response shapes** (`{ fields, description?, usage }` /
`{ questions, usage }`), and **does not touch the LLM path** — both stay live so they can be A/B'd.
The extension picks which to call via its `EXTRACTION_MODE` flag (default `"llm"`).

- **No generation LLM, ever (pure non-LLM).** The existing LLM routes remain the manual fallback to
  switch to where the tiered path underperforms. `usage` is zero; each call logs one `ExtractionLog`
  row with `model: "tiered:<tiers>"` (e.g. `tiered:jsonld+embeddings`) so cost/coverage compare
  directly against the LLM rows.
- **Job details — two tiers** (`details-tiered.ts`). Tier 1: parse JSON-LD `schema.org/JobPosting`
  (`structured-data.ts`) → microdata/`{key,value}` segments → OG/meta, mapping to our fields with
  the schema's controlled `employmentType` vocab and `TELECOMMUTE → Remote`. Tier 2 (only for
  attribute fields tier 1 missed): embed the page's segment **keys**, match them to the field
  prototypes (`prototypes.ts`) with the shared autofill `MIN_SCORE`, and snap free-text enums to the
  vocab (stricter `TIERED_ENUM_MIN_SCORE`, else drop). A page whose JSON-LD is complete makes **zero**
  embed calls. Title/company/description fall back to JSON-LD → meta → `h1` — never fabricated, so a
  field the structured path can't fill comes back **absent**, firing the extension's existing
  blank-title/company/description warnings exactly as a failed LLM call would.
- **Application questions — two tiers** (`questions-tiered.ts`). Tier 1: the extension harvests every
  form control (`harvestQuestions()`, reusing the autofill label heuristics; **includes file inputs**
  and carries the native input type) and we map DOM kind + type → our 12-type vocab. Tier 2: an
  embeddings **inclusion gate** keeps a field iff its label is semantically closer to the question
  prototypes than to the noise prototypes (search/login/newsletter/cookie) — structurally-strong
  fields (choice/file/long-text/required) only need to beat noise; weak free-text fields must also
  clear `TIERED_QUESTION_KEEP_FLOOR` and beat noise by `TIERED_NOISE_MARGIN`. An empty form returns
  `{ questions: [] }` (the "no application form" state) with **no** embed call. The kept questions
  pass through the same `normalizeApplicationQuestions()` sieve as the LLM path.
- **Prototypes are embedded once** (`prototype-embeddings.ts`, process-memoized) — there is no vector
  DB; this is tens of vectors matched in-memory exactly like the autofill matcher. Embeddings reuse
  the single `embed()` seam (`lib/llm/embeddings.ts`, `EMBEDDINGS_MODEL`), so a swap to a local model
  is a one-file change. All thresholds are env-overridable (`TIERED_*` in `lib/env.ts`).

### Import from a URL (`POST /api/jobs/import`)

The web app's "save a job without the extension" path: the user pastes a posting URL into the
dashboard modal (`components/dashboard/import-job-dialog.tsx`) and the server does everything.

- **One external call, no Groq spend.** `lib/server/job-import.ts` makes a single **Firecrawl**
  `/v2/scrape` request (`lib/llm/firecrawl.ts`, key in `FIRECRAWL_API_KEY` — server-side only)
  with `formats: [{ type: "json", schema, prompt }, { type: "branding" }]` and
  `onlyMainContent: true`. Firecrawl's **own** LLM runs the JSON extraction, so the whole job
  (details + description + application questions) comes back in that one call — this path does
  **not** touch the Groq pipeline. The schema/prompt live in `lib/llm/job-import-extraction.ts`
  and mirror the rules in `extraction.ts` + `application-extraction.ts`.
- **Same save path as everything else.** The result is mapped through the existing
  `normalizeExtractedFields` / `normalizeApplicationQuestions`, validated by the **same**
  `createJobSchema`, and saved via the **same** `createJob()` — so dedup-by-URL, the optional
  `application` form, and `source` (the posting host) are identical to an extension save.
- **Logo** comes from Firecrawl's `branding` profile (`pickLogoUrl`): only real `http(s)` image
  URLs (data: URIs rejected), and **suppressed on chrome-heavy aggregators** (LinkedIn, Indeed,
  Glassdoor, …) where branding would grab the *site's* logo, not the company's. (`logoUrl` is
  stored but not yet rendered on cards — a follow-up.)
- **Anti-hallucination guard.** The prompt hard-rules that a non-posting page (homepage, careers
  index, login wall, 404) must return null `title`/`company` and empty questions; the service
  then **400s** ("couldn't find a job title and company") rather than saving a fabricated job.
  Verified: `https://example.com` → 400, real Greenhouse posting → saved with questions.
- **Latency.** Firecrawl renders + extracts, so a scrape takes **~50–100s** on JS-heavy ATS
  pages. The client allows ~100s (`API_TIMEOUT_MS`), the route sets `maxDuration = 120` for
  production, and the modal shows a multi-step, abortable loading state. A Firecrawl
  `SCRAPE_TIMEOUT` maps to a clean retryable 400.

**Details and the form can live on different URLs.** Some ATSs split a posting from its apply
form (e.g. Ashby renders the form at `…/<id>/application`). So `/api/jobs/import` returns a
**discriminated result** (200 `{ data }`), not just the job:

- `{ outcome: "saved", job }` — the page had job details; the job is saved (with any questions
  found on it). If `job.application` is absent, the form wasn't on that page — the modal offers to
  fetch it from a second URL (below).
- `{ outcome: "application_only", questions }` — the page was an **apply form with no job
  identity** (no title/company). Nothing is saved yet; the client holds the `questions` and
  re-imports with the **job posting URL** plus `carryQuestions`, and the service attaches them to
  the job it then creates (preferring any questions the posting page itself yields).
- Neither found → **400** (the non-posting guard above).

`POST /api/jobs/:id/application` `{ url }` is the companion for the first case: it scrapes the
second URL with an **application-only** schema/prompt (`APPLICATION_IMPORT_*`, no job-posting
gate), then **upserts** the questions onto the existing job via `updateJob` (status and other
fields untouched). Returns the updated job. Verified end-to-end against Ashby: bare posting saved
with no form → attach `…/application` → 14 questions, status preserved.

### Rate limits (shared Groq client)

`lib/llm/groq.ts` backs both extraction endpoints. Groq's free tier has tight per-minute
token limits, so a transient **429** is common on large pages — and Groq often returns it
*without* a `Retry-After` header. The client therefore retries **every** 429 (up to
`MAX_429_ATTEMPTS`): it honors a short `Retry-After` when present, otherwise backs off
(`RETRY_BACKOFF_MS × attempt`), and only after exhausting the attempts (or when the server
asks for a long wait) throws `ApiError("RATE_LIMITED")` → HTTP **429** with a user-facing
message the extension shows in its retry state. Note: Groq rate limits are **per account/org,
not per key** — rotating `GROQ_API_KEY` does not reset them. Prompt caching also eases this:
cached input tokens (the reused page on the second call — see the caching note above) **don't
count toward the per-minute token limit**, so the application call on a co-present posting is
much less likely to trip a 429.

### AI cover letter (`POST /api/cover-letter`)

Powers the Resume → **Cover Letter** generator (`/dashboard/resume/cover-letter`). The client sends
`{ jobId, resumeId?, instructions? }`; the service (`lib/server/cover-letter.ts`) loads the job
**user-scoped** (`getJob` — 404s on someone else's id), resolves the resume text, and builds the
prompt (`lib/llm/cover-letter.ts`). Unlike the extraction endpoints, the success response is a **raw
text stream**, not the `{ data }` envelope: `lib/llm/openrouter-stream.ts` opens **OpenRouter's**
OpenAI-compatible SSE stream and the route pipes the letter back token-by-token so the UI renders it
live.

- **Provider: OpenRouter, not Groq.** Cover letters are creative prose, a different job from Groq's
  structured extraction. We use OpenRouter for two reasons: **model fallback** — the request sends a
  CHAIN (`COVER_LETTER_MODEL` then `COVER_LETTER_FALLBACK_MODELS`, default GLM 4.7 → GLM 4.7 Flash →
  Gemini 3.1 Flash Lite) and OpenRouter routes to the first healthy one — and **prompt caching**: the
  static system prompt is sent with a `cache_control` breakpoint so supporting providers reuse it
  across calls instead of re-billing those input tokens (GLM honors this; confirmed `cached_tokens`
  in usage). Reasoning is disabled (`reasoning.enabled=false`) — GLM 4.7 is a reasoning model and we
  don't want chain-of-thought spending the budget on prose. Output is capped at
  `COVER_LETTER_MAX_TOKENS` (700, ~one page). Temperature 0.7. Key in `OPENROUTER_API_KEY` (server only).
- **Errors before the stream stay JSON.** Validation, job-not-found, and missing-key/rate-limited
  are all thrown *before* any byte is written, so they come back as the normal `{ error }` envelope
  (status 400/404/429/500). Once the stream opens, an upstream failure just ends it early; the client
  treats a truncated draft as editable/retryable.
- **No new DB writes.** Generation reads a job + resume and streams text — nothing is persisted. (The
  saved letter could become a model later; today it lives in the client editor.)
- **Resumes are real documents.** The picker lists the user's uploaded documents
  (`lib/server/resumes.ts#listResumes`, metadata only — now also carrying `textReady` so the UI can
  warn about an unreadable file). At generation time `getResumeText(userId, id)` returns the text
  that was parsed and **stored at upload** (see Documents → "Text is extracted once") — a plain DB
  read, no R2 fetch and no re-parse. An absent/foreign/unparseable `resumeId` → less-personalized
  letter. The prompt **hard-bans fabrication**: it works only from the job + resume.
- **Per-job resume selection + deep link.** The job detail page's right rail has a **Resume** card
  (`components/dashboard/job-detail/job-resume-card.tsx`) to pick (or inline-upload) the resume for
  that job; the choice persists on the job via `PATCH /api/jobs/:id { resumeDocumentId }` so it's
  chosen once and reused. Its "Generate cover letter" button deep-links to
  `/dashboard/resume/cover-letter?jobId=…&resumeId=…`, and the generator preselects both.
- **Job input reuses the import path.** Pasting a posting URL in the picker hits the same
  `POST /api/jobs/import` as the sidebar "Save a job" button, so it's saved to the DB as a new job and
  then selected — no separate ingestion.

## Auth

The **webapp** authenticates with **Neon Auth** (Better Auth) — email/password + email-code
verification + Google. Full details in [`AUTH.md`](AUTH.md). The single seam is still
`lib/auth/current-user.ts`, now async:

- `getServerUserId()` / `getSessionUser()` — dashboard server components. Read the Neon Auth
  session (redirect to `/auth/sign-in` if absent) and bridge the identity into `public.users`.
- `getUserId(req)` — API route handlers. Prefer the Neon Auth session (the webapp, via its cookie);
  fall back **in non-production only** to the `x-user-id` header / `DEV_USER_ID` so the **extension**
  and curl keep working until the extension gets its own auth. Throws `ApiError.unauthorized()`
  otherwise.

⚠️ The `x-user-id` / `DEV_USER_ID` fallback is a **dev-only** seam (never honored in production) and
is **not secure** — it's there for the extension, which is out of scope for this auth iteration.

## CORS

`lib/api/cors.ts` echoes an allowed `Origin`. In development any
`chrome-extension://` origin is allowed automatically. For production, list the
published extension id and the web app origin in `ALLOWED_ORIGINS`.

---

## Gotchas (Prisma 7 / Next 16) — already solved, don't re-trip

- **Connection URLs are NOT in `schema.prisma`.** They live in `prisma.config.ts`
  (CLI/migrations) and `lib/db.ts` (runtime). v7 removed `url`/`directUrl` from the
  datasource block.
- **Prisma 7 requires a driver adapter.** Both the runtime client (`lib/db.ts`) and
  the seed (`prisma/seed.ts`) construct `new PrismaClient({ adapter })` with the Neon
  adapter. A bare `new PrismaClient()` throws — adapter is not optional.
- **Neon adapter takes config, not a Pool:** `new PrismaNeon({ connectionString })`
  (it manages the pool internally). Node needs `neonConfig.webSocketConstructor = ws`.
- **Next 16 route handlers:** `ctx.params` is a Promise — `const { id } = await params`.
  Type the context with the global `RouteContext<'/api/jobs/[id]'>` helper if preferred.

## Local setup

> Already done in this repo (creds in `.env`, schema pushed, dev user seeded). These
> steps are the from-scratch reference / for a new machine or a fresh Neon branch.

1. **Create a Neon project** at https://neon.tech. From *Connection Details* copy
   both the **pooled** string (host has `-pooler`) and the **direct** string. The
   direct string is the pooled one with `-pooler` removed from the host.
2. Put them in `webapp/.env` (see `.env.example`):
   ```
   DATABASE_URL="<pooled ...-pooler... ?sslmode=require>"
   DIRECT_URL="<direct ?sslmode=require>"
   ```
3. Push the schema and seed a dev user:
   ```bash
   npm run db:push      # create tables from schema.prisma
   npm run db:seed      # creates dev user, prints DEV_USER_ID
   ```
   Copy the printed `DEV_USER_ID` into `.env`.
4. Run and test:
   ```bash
   npm run dev
   ./scripts/smoke-test.sh        # exercises the full CRUD cycle
   ```

`npm run db:studio` opens a GUI to inspect data.

`npm run db:randomize-status` is a one-off backfill that gives every existing job a random
pipeline `status` (across the five board stages) — used to populate the `/dashboard/saved`
Kanban board (`components/dashboard/kanban-board.tsx`) with realistic spread. The board moves
cards between stages with an optimistic update + `PATCH /api/jobs/:id { status }` (rolling back
on failure); it reuses the existing CRUD path, no new endpoint.

## Calling the API from the Chrome extension

From a background script / popup (dev example — auth header is temporary):

```js
const API = "http://localhost:3000" // set to deployed URL in production

async function saveJob(job) {
  const res = await fetch(`${API}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": DEV_USER_ID, // replaced by a real auth token later
    },
    body: JSON.stringify(job),
  })
  const { data, error } = await res.json()
  if (!res.ok) throw new Error(error?.message ?? "Request failed")
  return data
}
```

The extension's `manifest.json` needs `host_permissions` for the API origin
(e.g. `"http://localhost:3000/*"` in dev, the deployed origin in prod).

## Adding a new resource (recipe)

1. Add the model to `prisma/schema.prisma`; `npm run db:push` (or `db:migrate`).
2. Add Zod schemas in `lib/validations/<thing>.ts`.
3. Add a service in `lib/server/<thing>.ts` (always `userId`-scoped).
4. Add `app/api/<thing>/route.ts` (+ `[id]/route.ts`) using `withRoute`, `ok`,
   `created`, `preflight`.
5. `npm run typecheck` and extend `scripts/smoke-test.sh`.
