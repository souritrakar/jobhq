# Job Reminders — Design

Date: 2026-06-23
Status: Implemented (2026-06-24)

Implementation note: one addition beyond this spec — `POST /api/reminders` (+
`createStandaloneReminder` client helper) so the global feed's composer persists standalone
reminders too, keeping its complete/dismiss persistence coherent. Per-job creation still goes
through `POST /api/jobs/:id/reminders`.

## Goal

Let a user create and view reminders for a specific saved job from the job detail page,
in two places:

1. **Primary** — a "Reminders" card in the right rail, directly below the Notes card.
2. **Secondary** — a "Remind me" button in the top-right action cluster, next to
   "Open original", as a fast-capture shortcut.

Both triggers open the **same** lightweight popover (not a modal, not a full form).
Reminders auto-link to the current job (company, role, logo come from page context),
persist to the database, and surface on the existing global Reminders page.

## Decisions (from brainstorming)

- **Scope:** full slice — DB model + migration, service layer, API routes, job-page UI,
  and wiring the global Reminders page to real data.
- **Reminder shape:** free-text title (no category enum); a single generic icon per row.
- **Job context** (company / role / logo) is derived from the linked job, never stored on
  the reminder — nothing to attach manually.
- **Global feed:** swap `sampleReminders()` → real `listReminders(userId)` AND make a small
  additive change to surface the due-date label on rows and persist complete/dismiss. No
  layout/grouping redesign.

## Constraints from the existing codebase

- Next.js 16 App Router, React 19, Prisma 7 (Neon adapter; connection URLs in
  `prisma.config.ts`, NOT `schema.prisma` — see `webapp/AGENTS.md` / `docs/BACKEND.md`).
- Layering is strict: route handler → Zod validation → `lib/server/*` service → Prisma.
  Never call Prisma from a route. Every query is `userId`-scoped.
- API uses the `{ data } | { error }` envelope via `withRoute` / `ok` / `preflight`
  (`lib/api/route.ts`). Browser helpers throw a plain `Error` with the server message.
- Auth is the `x-user-id` stub (`lib/auth/current-user.ts`); reminders inherit it unchanged.
- A client `Reminder` type and the `RemindersFeed` component already exist
  (`lib/reminders/sample.ts`, `components/dashboard/reminders-feed.tsx`). The feed was
  built against an intended seam: replace `sampleReminders()` with `listReminders(userId)`.
- Mutation pattern in use: optimistic UI + `router.refresh()` (see `notes-editor.tsx`,
  `status-menu.tsx`).
- Reusable `Menu` popover primitive (`job-detail/menu.tsx`): anchored panel, outside-click
  + Escape dismissal, caller-rendered trigger. The reminder popover builds on it.

## Data model

New enum + model in `webapp/prisma/schema.prisma`:

```prisma
enum ReminderType {
  SYSTEM   // reserved for future auto-generated nudges
  USER     // the user set it (everything created in this feature)
}

model Reminder {
  id        String       @id @default(cuid())
  userId    String
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobId     String?      // links to the posting; null = standalone (feed already supports this)
  job       Job?         @relation(fields: [jobId], references: [id], onDelete: Cascade)
  title     String       // free text, e.g. "Follow up with Anthropic"
  type      ReminderType @default(USER)
  dueAt     DateTime?    // when the reminder is due
  hasTime   Boolean      @default(false)  // true = dueAt has a meaningful time-of-day; false = date-only
  done      Boolean      @default(false)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  @@index([userId, done])
  @@index([userId, dueAt])
  @@index([jobId])
  @@map("reminders")
}
```

- Add `reminders Reminder[]` back-references to `User` and `Job`.
- `onDelete: Cascade` on the job relation: deleting a job removes its reminders.
- `hasTime` distinguishes "Jun 30" (date-only) from "Jun 30, 2:00 PM" for display.
- Generate a Prisma migration (`reminders` table).

## Types

Move the client reminder type out of the sample file into `lib/reminders/types.ts`:

```ts
export type ReminderType = "system" | "user"

export type Reminder = {
  id: string
  title: string
  type: ReminderType
  createdAt: string            // ISO; drives the global feed's time grouping
  done: boolean
  dueAt?: string               // ISO; when it's due (new)
  hasTime?: boolean            // whether dueAt carries a time-of-day (new)
  job?: { id: string; company: string; title: string }
}
```

`lib/reminders/sample.ts` and `components/dashboard/reminders-feed.tsx` import the type
from `types.ts`. Sample data unchanged otherwise.

## Service layer — `lib/server/reminders.ts`

All `userId`-scoped; `{id, userId}` filters on single-row reads/writes.

- `listReminders(userId)` — all reminders for the global feed, newest `createdAt` first,
  `include: { job: { select: { id, company, title } } }`.
- `listJobReminders(userId, jobId)` — reminders for one job, ordered: open before done,
  then soonest `dueAt`.
- `createReminder(userId, input)` — `{ jobId?, title, dueAt?, hasTime? }`, `type: USER`.
- `updateReminder(userId, id, input)` — toggle `done` and/or edit `title`/`dueAt`/`hasTime`.
- `deleteReminder(userId, id)`.
- `toClientReminder(row)` — Prisma row → client `Reminder` (lowercase the enum, ISO-stringify
  dates, map the included job to `{ id, company, title }`).

## Validation — `lib/validations/reminder.ts`

```ts
createReminderSchema = z.object({
  jobId: z.string().optional(),
  title: z.string().trim().min(1).max(300),
  dueAt: z.coerce.date().optional(),   // same coercion as job.deadline
  hasTime: z.boolean().optional(),
})
updateReminderSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  hasTime: z.boolean().optional(),
  done: z.boolean().optional(),
}).refine(at least one field present)
```

## API routes

- `app/api/jobs/[id]/reminders/route.ts`
  - `GET` → `listJobReminders(userId, id)` (serialized).
  - `POST` → `createReminder(userId, { jobId: id, ...body })`.
- `app/api/reminders/[id]/route.ts`
  - `PATCH` → `updateReminder` (toggle done / edit).
  - `DELETE` → `deleteReminder`.
- All via `withRoute` / `ok` / `preflight`, returning serialized client reminders.
- The global page reads via the service directly (server component) — no list route needed.

## Browser helpers — `lib/reminders/client.ts`

Mirror `lib/jobs/client.ts` envelope handling:

- `createReminder(jobId, { title, dueAt?, hasTime? })` → `POST /api/jobs/:jobId/reminders`.
- `toggleReminder(id, done)` → `PATCH /api/reminders/:id`.
- `deleteReminder(id)` → `DELETE /api/reminders/:id`.

Each returns the updated client `Reminder` (or void for delete) and throws `Error` with the
server message on failure.

## UI components

### `ReminderPopover` (shared)
Built on the `Menu` primitive (wider `panelClassName`). Content:
- Text `Input` prefilled `Follow up with {company}` (selected on open for quick overwrite).
- Quick-pick date chips: **Tomorrow · In 3 days · Next week · Custom**. Selecting one sets
  `dueAt` relative to now; **Custom** reveals a native `<input type="date">`.
- Optional `<input type="time">`; if set, `hasTime = true`.
- **Save** button (disabled while title is empty / request in flight).

Props: `renderTrigger`, `jobId`, `company`, `onSaved(reminder)` callback. No date library;
native inputs styled with token classes (matching `Input` / focus-ring treatment).

### `RemindersCard` (rail, below Notes)
In `tracking-rail.tsx`, a third `Card` titled "Reminders" (reuses `RailHeader`).
- **List rows:** circular checkbox (reuse the feed's `Checkbox` pattern, extracted to a
  shared component), generic `Bell` icon, title, and `dueLabel` (overdue tinted).
- **Empty state:** quiet — "No reminders yet — add one to follow up".
- **"+ Add reminder" row:** opens `ReminderPopover`.
- Uses React 19 `useOptimistic` for instant add/toggle, then `router.refresh()` for truth.
- States shipped: empty, hover (row reveals complete + subtle dismiss), saved.

### "Remind me" button
In `job-detail-header.tsx`, between "Open original" and the overflow `Menu`. Outline `sm`
button (`Bell` icon) wrapping `ReminderPopover`. On save: persists + `router.refresh()`; the
rail re-renders from fresh server props.

### Dates helper
Add `dueLabel(dueAt, hasTime)` to `lib/dates.ts`:
"Today" / "Tomorrow" / "In N days" / "Jun 30" / "Jun 30, 2:00 PM"; past due → "Overdue"
styling cue (returned flag or caller checks `daysUntil`).

## Page wiring

`app/dashboard/jobs/[id]/page.tsx`: after `loadJob`, call
`listJobReminders(getServerUserId(), id)`, serialize, and pass to `TrackingRail`
(new `reminders` prop) → `RemindersCard`. `JobDetailHeader` already receives `id` + `company`.

## Global feed changes (minimal, additive)

`app/dashboard/reminders/page.tsx`: replace `sampleReminders()` with
`listReminders(getServerUserId())` (serialized). In `reminders-feed.tsx`:
- Show `dueLabel` on rows that have a `dueAt` (additive; grouping by `createdAt` unchanged).
- Persist complete (`toggleReminder`) and dismiss (`deleteReminder`) via the client helpers,
  keeping the existing optimistic update then reconciling.
No layout or grouping redesign.

## Out of scope

- Background workers / notifications that fire reminders (BACKEND.md notes these come later).
- Editing a reminder's text after creation from the rail (toggle + dismiss only for now);
  the update API supports it but no inline edit UI ships in this pass.
- Reminder categories / type picker (explicitly decided against).

## Testing

- Service: create/list/update/delete scoped by `userId`; cross-user access denied; job delete
  cascades reminders; `listJobReminders` ordering (open-first, soonest due).
- Validation: title required/length; `dueAt` coercion; update requires ≥1 field.
- Component/UI: popover opens from both triggers with correct prefill; quick-pick chips set
  expected dates; empty/hover/saved states render; optimistic add + toggle reconcile after
  refresh.

## Note

The working directory's `.git` is an empty directory — git is not initialized here, so this
spec is written but not committed. Initialize git (or point me at the real repo) to version it.
