# To-do + Reminders unification

**Date:** 2026-06-26
**Status:** Approved — ready for implementation

## Problem

Today the only way to keep a per-job task list is to create a reminder. Every task
therefore has to carry due-date/notification machinery, which is heavyweight and
confusing for a user who just wants to jot "prepare portfolio link". We want plain
to-dos and dated reminders to coexist on a job, with the lowest-friction UI possible
and no conceptual confusion about where each one shows up.

## Core idea — no database migration

A to-do and a reminder are the **same `Reminder` row**; the only difference is whether
it has a due date:

- **To-do** — `dueAt` is null. Never fires. Lives only on its job's To-do panel.
- **Reminder** — `dueAt` is set. Fires via the existing QStash → worker → email /
  in-app / extension delivery path (untouched). Shows a bell + due label, and appears
  on the global Reminders page.

Adding a date to a to-do **is** "making it a reminder." The existing service already
supports this: `createReminder` accepts no `dueAt`, and the PATCH route +
`updateReminderSchema` already allow setting `dueAt`. So the backend barely moves and
there is **no schema change**.

## Changes

### 1. Per-job panel becomes "To-do"

Rename `components/dashboard/job-detail/reminders-panel.tsx` → `todo-panel.tsx` and
`reminders-card.tsx` → `todo-card.tsx` (update the import in
`app/dashboard/jobs/[id]/page.tsx`). The data source stays `listJobReminders`, which
returns all of a job's rows (to-dos **and** reminders) — correct for this panel.

- **Title** "To-do", icon `ListTodo`.
- **Header badge:** remove the "N open" badge entirely (noise). Keep only the red
  "N overdue" badge, shown when a dated reminder is past due — a real, actionable alert.
- **Rows:** checkbox + text. A reminder row additionally renders the bell + due label
  (existing `dueLabel` / overdue pill). That bell **is** the visual indicator that the
  row is a reminder. Plain to-dos are text-only. Hierarchy reads at a glance:
  text = task, bell + date = reminder.
- **Add row:** one always-visible inline input.
  - Type + **Enter** → plain to-do (`createReminder` with no `dueAt`). Fastest path.
  - Trailing **bell button** opens the schedule popover (chips / custom date / time),
    carrying the typed text → saves a dated reminder.
- **Convert later:** hovering a plain to-do reveals a quiet bell that opens the same
  schedule popover and PATCHes `dueAt` onto the existing row (the scheduler kicks in
  automatically via `updateReminder`). The delete X stays on hover.
- **Empty state:** "No tasks yet — add one to stay on track."

### 2. Global Reminders page stays "Reminders", dated-only

The page and sidebar nav keep the name "Reminders". Plain to-dos must never appear here.

- `listReminders` query gains `dueAt: { not: null }`.
- In `reminders-feed.tsx`, remove the "No date" / `unscheduled` bucket (no dateless
  rows can reach the feed now), and make the composer require a date — disable "Add
  reminder" until a chip or custom date is chosen — so a standalone reminder can never
  be saved as an invisible dateless row.

### 3. Sidebar badge matches the page

`countOpenReminders` gains `dueAt: { not: null }` so the "Reminders" nav count reflects
open **dated** reminders only — matching what the page shows.

### 4. Client seam

Add `setReminderDue(id, { dueAt, hasTime })` to `lib/reminders/client.ts` for the
convert flow. It reuses the existing `PATCH /api/reminders/:id` route and
`updateReminderSchema`. No new endpoints, no validation change, no migration.

## Files touched

- `components/dashboard/job-detail/todo-panel.tsx` (from `reminders-panel.tsx`)
- `components/dashboard/job-detail/todo-card.tsx` (from `reminders-card.tsx`)
- `components/dashboard/job-detail/reminder-popover.tsx` (schedule-only trigger variant
  for the bell / convert flow)
- `components/dashboard/reminders-feed.tsx` (drop No-date bucket, require a date)
- `lib/server/reminders.ts` (`listReminders` + `countOpenReminders` filters)
- `lib/reminders/client.ts` (`setReminderDue` helper)
- `app/dashboard/jobs/[id]/page.tsx` (import rename)
- `docs/REMINDERS.md` (document the to-do / reminder split)

## Testing

- Service-layer test: `listReminders` and `countOpenReminders` exclude dateless rows;
  `listJobReminders` still returns both.
- Type-check / build pass for the reworked UI.

## Out of scope (YAGNI)

- Rescheduling an existing reminder's date (keep current behavior).
- A global To-do page — to-dos are per-job only.
- Extension changes — its `listUpcomingReminders` already filters to dated rows.
