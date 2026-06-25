# Manual answer save + extension read-only answer view

**Date:** 2026-06-24
**Status:** Approved (design)

## Context & root cause

The individual job page (`app/dashboard/jobs/[id]`) renders captured application
questions as live, fillable fields. Today each text field **autosaves**: an 800ms
debounced `PUT /api/jobs/:id/application/answers` per field, flushed on blur, and an
AI draft persists itself immediately via `void persist(drafted)`
(`components/dashboard/job-detail/application-field.tsx`).

The reported symptom — "AI-drafted answers don't show up after reload" — is **not** a
missing save path. The chain is fully wired: drafts persist, typing autosaves, and
`page.tsx` re-seeds fields from `getApplicationAnswers` on load. The realistic causes
of a vanished draft are both side effects of autosave being **async and invisible**:

1. **Navigation race** — `void persist(drafted)` is fired-and-not-awaited; a hard
   reload/navigation within that window can abort the in-flight request before it
   reaches the DB.
2. **Silent failure** — a failed upsert only renders as tiny "Couldn't save" text
   under the field, easily missed (and masked while the field shows "Drafting…").

**Fix:** replace autosave entirely with explicit **manual save** — nothing persists
until the user clicks Save, and Save gives loud success/error feedback. The redesign
*is* the bug fix.

## Goals

- Webapp: replace per-field autosave with a single, explicit, **batched** save.
- A sticky bottom save bar (Save / Cancel) visible only when there are unsaved changes,
  with clean enter/exit animation and a `beforeunload` guard.
- One DB transaction per Save click instead of many debounced upserts (cost / scale).
- Extension: let a user view the **current DB answers** for a saved job, read-only,
  fetched **once per page load**, for convenient copy-paste.
- Bigger textarea boxes for long-answer questions (webapp + extension).

## Non-goals

- Editing/saving answers **from** the extension (read-only for now; possible later phase).
- Persisting choice/file answers (still preview-only, unchanged).
- Touching the questions/extraction pipeline or the extension's local-first cache model.

## Architecture: data ownership (unchanged)

| Data | Writers | Readers | Storage |
|------|---------|---------|---------|
| Questions (form structure) | Extension | Extension + web | `JobApplication.questions` JSON |
| Answers (values) | **Web only** | **Web + extension (read)** | `JobApplicationAnswer` rows |

The extension gains **read** access to answers (it had none). It still never writes them.

---

## Feature A — Webapp manual save

### A1. Backend: batch save

- **Schema** (`lib/validations/application-answer.ts`): request body becomes
  `{ answers: [{ questionId: string, value: string }] }` (array; bounded length).
- **Service** (`lib/server/application-answers.ts`): add
  `saveApplicationAnswers(userId, jobId, answers[])`:
  - Resolve the application once; validate every `questionId` against the form's id set.
  - In **one `prisma.$transaction`**: `deleteMany` rows whose value is whitespace-only,
    and upsert the rest. Return the resulting `{questionId: value}` map.
  - Keep the existing single `upsertApplicationAnswer` only if still referenced; otherwise
    remove it. (Only the web field consumes it today, so it will be removed.)
- **Route** (`app/api/jobs/[id]/application/answers/route.ts`): `PUT` parses the batch
  body and calls the new service. Same response envelope.

### A2. Backend: expose answers on the job (for the extension)

- `GET /api/jobs/:id` includes `application.answers` as a `{questionId: value}` map.
  Add it wherever the job is serialized for that route (`lib/server/jobs.ts` /
  the job serializer), reusing `getApplicationAnswers`. The web page keeps loading
  answers via its own `getApplicationAnswers` call — this addition is for Feature B.

### A3. Web client

- **Client lib** (`lib/application/client.ts`): replace `saveAnswer(jobId, qId, value)`
  with `saveAnswers(jobId, answers[])` hitting the batch route. `draftAnswer` unchanged.
- **New client component** `components/dashboard/job-detail/application-answers.tsx`
  (`"use client"`) — owns the form-wide state:
  - `baseline: Record<string,string>` (last saved) and `draft: Record<string,string>`
    (working), seeded from server `answers`.
  - `dirty` = ids where `draft[id] !== (baseline[id] ?? "")`; `dirtyCount`.
  - Renders each question's field as a **controlled** component (value + `onChange` +
    `onDraft` passed down). Owns `saving`/`error` state for the save bar.
  - `save()` → one `saveAnswers` call with the dirty entries → on success
    `baseline = {...draft}`; on error keep draft + show error in the bar.
  - `cancel()` → `draft = {...baseline}`.
  - `beforeunload` listener active only while `dirty`.
- **`application-field.tsx` becomes presentational**: strip `persist`, the debounce,
  blur-save, and per-field "Saving/Saved" status. The field now takes `value`,
  `onChange`, `onDraft`, `drafting`, and renders the control + AI draft button. The AI
  draft button calls `onDraft` (which fetches and calls `onChange(drafted)` in the
  parent — marking dirty, **not** persisting).
- **`application-form.tsx`** (server) keeps the section/card shell but delegates the
  field list to `application-answers.tsx`; footer copy changes from "saves as you type"
  to manual-save wording.

### A4. Bottom save bar

- Sticky, pinned to the viewport bottom (`fixed inset-x-0 bottom-0`, centered content,
  z-above content), rendered only when `dirtyCount > 0`.
- Enter/exit: translateY + opacity transition; respects `prefers-reduced-motion`
  (no transform, just instant show/hide).
- Content: `"{n} unsaved change(s)"` · **Cancel** (ghost, `cancel()`) · **Save**
  (primary; spinner + disabled while `saving`). On error, an inline error message in
  the bar; the bar stays so the user can retry. On success the bar animates out.

### A5. Bigger long-answer textareas (web)

- The `long_text` textarea grows from `rows={4}` to a larger box (e.g. `rows={7}` /
  a taller `min-height`), still `resize-y`.

---

## Feature B — Extension read-only answer view

### B1. Thread answers through the existing once-per-load revalidation

- No new fetch or guard. The existing `revalidatedAnchors` Set
  (`content.js:40-44`) already enforces "one `GET /api/jobs/:id` per saved posting per
  page load; reopening the panel reuses cache; page refresh re-fetches."
- In `applyServerJob()` (`content.js:367-396`), read `job.application.answers` from the
  already-happening fetch and store it on the cached record as a sibling `answers`
  map (`record.answers = {questionId: value}`). Absent/empty → store `{}`.

### B2. Populate fields, read-only

- `ui/application.js`: `render(questions, opts)` and `buildField` accept the `answers`
  map. Each control sets its value from `answers[q.id]`:
  - text/textarea/select → `.value`; radio/checkbox/multi → check matching option(s).
- When answers are present, populated controls render **read-only**
  (`readOnly`/`disabled` as appropriate) — selectable and copyable, visibly not an
  editor. (Extension fields never persisted, so this only clarifies intent.)
- The modal's `loadApplication()` path passes the cached `answers` alongside `questions`
  so reopening the panel re-renders populated fields from cache (no refetch).

### B3. Bigger long-answer textarea (extension)

- `textareaControl` in `ui/application.js` gets a larger default height to match the
  webapp change.

---

## Error handling

- **Batch save fail** (network / validation): the save bar shows an inline error,
  retains the draft, and stays open for retry. No partial silent loss.
- **Transaction**: all-or-nothing — a bad `questionId` rejects the whole batch with a
  clear message (consistent with the current per-question guard).
- **Extension fetch fail / slow** (>2.5s): unchanged — falls back to the cached snapshot
  (existing `revalidateSaved` timeout). Missing answers simply render empty fields.

## Testing

- **Service** (`saveApplicationAnswers`): upsert + clear-on-empty in one transaction;
  rejects unknown `questionId`; returns the saved map. (Vitest, mirroring existing
  `lib/server` tests.)
- **Route**: batch body validation (array shape, bounds); envelope shape.
- **`GET /api/jobs/:id`** includes `application.answers`.
- **Web UI** (manual / component): edit → bar appears with correct count; Save → one
  network call, bar dismisses, reload shows persisted values; Cancel reverts; AI draft
  marks dirty without saving; `beforeunload` fires only when dirty.
- **Extension** (manual): first panel open on a saved job populates answers read-only;
  collapse/reopen does not refetch; page refresh refetches; copy works.

## Files touched (anticipated)

**Backend/web:** `lib/validations/application-answer.ts`,
`lib/server/application-answers.ts`, `app/api/jobs/[id]/application/answers/route.ts`,
`lib/server/jobs.ts` (answers on GET), `lib/application/client.ts`,
`components/dashboard/job-detail/application-answers.tsx` (new),
`components/dashboard/job-detail/application-field.tsx`,
`components/dashboard/job-detail/application-form.tsx`,
`app/dashboard/jobs/[id]/page.tsx` (wiring).

**Extension:** `content.js` (cache answers in `applyServerJob` / load path),
`ui/application.js` (populate + read-only + textarea size), `ui/modal.js` (pass answers
through `loadApplication`).
