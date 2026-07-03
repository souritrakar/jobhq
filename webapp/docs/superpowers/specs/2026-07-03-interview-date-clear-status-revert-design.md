# Clear interview date → revert status; interview card header

Date: 2026-07-03

## Problem

On the individual job page, the interview-date control can set/clear a date, but two
things are missing:

1. Setting an interview date does not touch the pipeline status, and clearing it has no
   effect on status. The user wants setting a date to move the job to **INTERVIEWING**,
   and clearing the date to **revert to whatever the status was before** the date
   promoted it.
2. The interview card is a bare card with no section header, unlike the Resume / Notes /
   Reminders cards which all carry an icon-badged `PanelCard` header. The user wants the
   interview card to match that header typography.

## Part A — Auto-move to Interviewing, symmetric revert

### Chosen behavior

Setting an interview date automatically promotes the job to `INTERVIEWING` and remembers
the prior stage. Clearing the date restores that prior stage. Fully automatic and
symmetric — but only ever undoes a promotion the *date itself* caused; an explicit later
status choice is never reverted.

### Data model

Add one nullable column to `Job` (`prisma/schema.prisma`):

```prisma
statusBeforeInterview JobStatus? // the stage held before an interview date auto-promoted the job to INTERVIEWING; null when there is nothing to revert to
```

No backfill needed — existing rows default to `NULL`, which correctly means "no pending
revert".

### Logic — `updateJob` (`lib/server/jobs.ts`)

`updateJob` is the single writer for `interviewAt`; it already calls `getJob` first, so
the current `status`, `interviewAt`, and `statusBeforeInterview` are available. Compute
the status/memory transition, then include it in the `prisma.job.update` data.

Let `current` = the job as loaded, `nextInterview` = `input.interviewAt` (only when the
field is present in the patch).

- **Set a date** — `current.interviewAt == null && nextInterview != null` AND
  `current.status !== INTERVIEWING`:
  → `status = INTERVIEWING`, `statusBeforeInterview = current.status`.
- **Clear a date** — `nextInterview == null` AND `current.status === INTERVIEWING` AND
  `current.statusBeforeInterview != null`:
  → `status = current.statusBeforeInterview`, `statusBeforeInterview = null`.
- **Change date → date** (both non-null), or **set a date while already INTERVIEWING**:
  → no status/memory change.

### Guard against stale reverts

Whenever status is changed **manually**, clear `statusBeforeInterview` so a later
date-clear can't undo the user's deliberate choice:

- `updateJob` when `input.status !== undefined` (e.g. `patchJob({ status })` from
  `StatusMenu`): set `statusBeforeInterview = null` in the update.
- `updateJobStatuses` (bulk Kanban save): include `statusBeforeInterview: null` in each
  `updateMany` data payload.

Worked example: set date (APPLIED → INTERVIEWING, memory = APPLIED) → manually move to
OFFER (memory cleared) → clear date → stays OFFER. The revert only fires when the date
drove the promotion and nothing overrode it since.

### Client integration

`StatusMenu` keeps its own optimistic `status` state, so a date-driven status change
(triggered from the separate `InterviewDate` component) would not update the header pill
until a full reload. `InterviewDate.persist()` already calls `router.refresh()` after a
successful save; to make the refreshed server status flow into the pill, key the menu to
the server status in `job-detail-header.tsx`:

```tsx
<StatusMenu key={job.status} jobId={job.id} status={job.status} />
```

The key only changes after `refresh()` lands the new server status, so the menu's own
optimistic self-changes (which don't change the server prop until refresh completes) keep
working.

### Tests

Service-layer unit tests for `updateJob` (and the bulk path):

- Setting a date on a non-INTERVIEWING job → status becomes INTERVIEWING, memory records
  the old status.
- Clearing the date on that job → status restored, memory cleared.
- Setting a date while already INTERVIEWING → no memory captured; clearing later leaves
  status at INTERVIEWING.
- Manual status change (single + bulk) while a date is set → memory cleared; a later
  date-clear does not revert.
- Change date → date → status unchanged.

## Part B — Interview card section header

Replace the bare `<Card className="p-4">` wrapper in `tracking-panel.tsx` with the shared
`PanelCard`, matching the Resume card:

```tsx
<PanelCard icon={CalendarClock} title="Interview">
  <InterviewDate … />
</PanelCard>
```

Neutral tone (default), reusing the `h2 text-sm font-semibold tracking-tight text-foreground`
header. Import `CalendarClock` from `lucide-react`. Drop the now-stale comment explaining
why the header was omitted.

## Out of scope

- No change to how the interview reminder is scheduled (existing `upsertInterviewReminder`
  behavior is untouched).
- No prompt/confirmation UI on clear — the revert is automatic per the chosen behavior.
