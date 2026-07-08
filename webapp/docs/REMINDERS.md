# Reminders: scheduling, delivery & system generation

How reminders actually **fire** — delivered at their due time across the web app, email, and the
Chrome extension — plus the auto-generated interview reminders and the periodic digest.

Read [`BACKEND.md`](BACKEND.md) first for the route → validation → service → db layering and the
response envelope. The reminders **CRUD + feed** predate this; this doc covers the delivery layer
built on top.

## To-dos and reminders are the same row

A `Reminder` row is a **to-do**; a **due date is the only thing that makes it a reminder.**

- **`dueAt` is null → plain to-do.** Never fires. Lives only on its job's **To-do panel**
  (`components/dashboard/job-detail/todo-panel.tsx` → `todo-card.tsx`, fed by `listJobReminders`,
  which returns both kinds). Text-only row.
- **`dueAt` is set → reminder.** Fires via the delivery path below, renders a bell + due label
  (the visual "this is a reminder" cue), and surfaces on the global **Reminders page**.

This split is enforced entirely by a `dueAt: { not: null }` filter on the two queries that back the
global page — `listReminders` (the feed) and `countOpenReminders` (the sidebar badge) — so a
dateless to-do never leaks there. The Reminders-page composer likewise requires a date before save.
Attaching a date later ("convert a to-do into a reminder") is just a `PATCH` setting `dueAt`
(`setReminderDue` in `lib/reminders/client.ts`); `updateReminder` schedules the delivery off the
back of it. **No separate Todo model, no migration** — the distinction is purely the presence of a
due date.

## Architecture at a glance

```
create/edit a dated reminder
        │  lib/server/reminders.ts
        ▼
  scheduleReminderDelivery()            cancel/reschedule on edit/delete/done
        │  lib/reminders/scheduler.ts   (stores qstashMessageId on the row)
        ▼
   Upstash QStash  ──(at dueAt, signed HTTP POST { reminderId })──►  POST /api/reminders/fire
                                                                      (verifySignatureAppRouter)
                                                                            │
                                                                            ▼
                                                            fireReminder()  — atomic idempotent claim
                                                            lib/server/reminder-delivery.ts
                                                                            │
                                               dispatchReminderChannels()   │ lib/server/notification-dispatch.ts
                                  ┌─────────────────────────┼─────────────────────────┐
                                  ▼                         ▼                         ▼
                               EMAIL                      IN-APP                   EXTENSION
                         Resend (lib/email/*)        Notification row         chrome.alarms +
                                                     + header bell            chrome.notifications
                                                                             (local, no server push)

DAILY:  QStash cron ──► POST /api/cron/reminders-digest ──► runDigest()  (stale SAVED jobs → email + in-app)
```

Neon is the source of truth; **QStash never touches the DB** — it only carries a `reminderId`.

## Scheduling (`lib/reminders/scheduler.ts`)

- One module-level QStash `Client`, created only when `QSTASH_TOKEN` is set. When it's unset the
  scheduler **no-ops** so reminder CRUD still works locally (reminders just won't fire).
- `scheduleReminderDelivery(reminderId, fireAt)` → `publishJSON({ url: APP_URL + "/api/reminders/fire",
  body: { reminderId }, notBefore: epochSeconds })`, returns the QStash `messageId`.
- `cancelScheduledDelivery(messageId)` swallows 404s (already delivered/cancelled).
- Wired into the service: a reminder is **deliverable** iff `dueAt != null && !done`. On create it's
  scheduled and the `messageId` is stored; on update, if timing/done changed, the old message is
  cancelled and a new one scheduled (and `deliveredAt` reset so it can fire again); on delete it's
  cancelled.

## The worker (`POST /api/reminders/fire`)

QStash-signed (`@upstash/qstash/nextjs` `verifySignatureAppRouter`, using `QSTASH_CURRENT/NEXT_SIGNING_KEY`).
**Not** wrapped in `withRoute` — it's a machine webhook, not a CORS API.

`fireReminder(reminderId)` (`lib/server/reminder-delivery.ts`) is **idempotent**: the first thing it
does is an atomic

```ts
prisma.reminder.updateMany({ where: { id, deliveredAt: null, done: false }, data: { deliveredAt: new Date() } })
```

Exactly one caller wins `count === 1`; a QStash retry sees `count === 0` and sends nothing
(at-most-once per reminder). Channel sends after the claim are best-effort (logged, not rolled
back).

## Surfacing delivery in the UI: a reminder is a to-do

`done` and `deliveredAt` are **independent**, and only `done` resolves a reminder:

- `done` — the user manually ticked the reminder off (the round checkbox). **The only thing that
  closes a reminder.**
- `deliveredAt` — the worker fired it (email + in-app + extension notification went out). Firing is
  a *nudge*, not a completion: being reminded ≠ having handled the thing, so it **does not** tick the
  reminder, strike it through, or remove it from the open/overdue/badge counts.

So the list UI has just **two** states, computed by the shared helpers in
[`lib/reminders/status.ts`](../lib/reminders/status.ts) (`isComplete`/`isOpen`, both `done`-only)
and used by the global feed, the per-job rail card, and the sidebar badge:

| State | Predicate | UI |
| --- | --- | --- |
| **Open** | `!done` | live to-do: empty checkbox, urgency colour, due/overdue chip — *even after it has fired* |
| **Done** | `done` | checked (solid fern) + strike-through |

This is deliberate: a fired-but-unticked reminder stays a visible, actionable, still-overdue to-do
until the user ticks it. The **Reminders sidebar** red badge counts every open reminder
(`countOpenReminders`: `done = false`), fired or not.

### Overdue rendering (consistent across surfaces)

"Overdue" is a *subset* of open: `isOpen(r) && isOverdue(r.dueAt, r.hasTime)` (`lib/dates.ts`).
`isOverdue` is time-aware — a timed reminder ("due 2pm") goes overdue at 2:01pm, while a date-only
reminder only falls overdue once its whole day has passed. A reminder with no due date is never
overdue.

Overdue gets the same loud treatment everywhere so a missed follow-up reads as "act now", not faint
red text:

- **Global feed** (`reminders-feed.tsx` `DueChip`) and the **per-job card** (`job-detail/reminders-card.tsx`)
  both render overdue as a filled `bg-destructive/10` pill with a `TriangleAlert` icon and a
  `dueDisplay(...)` label ("Yesterday", "2 days overdue", "45 min overdue").
- **Headers/badges:** the global feed header shows a red "N overdue" count; the per-job
  **Reminders panel** header (`job-detail/reminders-panel.tsx`) mirrors it — a red "N overdue" pill
  that takes precedence over the neutral "N open" pill.

`deliveredAt` still rides the `Reminder` DTO (`toClientReminder`) and is used as *informational*
context — **not** a completion signal — on the job page's **Interview** control
(`job-detail/interview-date.tsx`). That control escalates through two urgency states plus the
handled/error ones, and shows the "We'll remind you 24h before" line **only while it's true**:

- **Scheduled** (future day, not today) — calm/neutral; sub-label "We'll remind you 24h before".
- **Day of** (interview is today, not yet passed) — the loud state: filled `status-interviewing`
  tint, bolder/larger type, a "Today" chip, label reads "Today, 2:00 PM". The 24h line is **hidden**
  (that heads-up has already gone out); the sub-label becomes "Interview today · <time>".
- **Reminded** ("We reminded you · <when>", `deliveredAt` set, still future/non-today) → **Reminder
  done** (ticked) → **Interview has passed** (past + nothing handled, amber).

The control also **only persists on Done/Clear**: picking a day/time edits a local draft, so a
half-finished pick (the 9:00 fallback) is never saved — nor its reminder mis-scheduled — mid-edit.

## Channels (`lib/server/notification-dispatch.ts`)

Resolved per user via `resolveChannels(prefs)` — with no `NotificationPreference` row (the current
state), **all channels default on**.

- **Email** — Resend (`lib/email/client.ts` + `templates.ts`). No-ops with a warning when
  `RESEND_API_KEY` is unset. Templates are table-based inline-styled HTML; every interpolation is
  escaped and hrefs are restricted to `http(s)`.
- **In-app** — a `Notification` row (`lib/server/notifications.ts`), surfaced by the dashboard bell.
- **Extension** — delivered **locally**, not from the server (see below).
- Copy is shared/templated (`lib/reminders/copy.ts`); no LLM anywhere in reminders. A fired
  individual reminder emails with subject `REMINDER : <reminder text>`; the body keeps the reminder
  text as the bold heading, then — when the reminder is tied to a job — names the **role at company**,
  followed by a short friendly nudge. The job's role/company are fetched in `reminder-delivery.ts`
  and threaded through `ReminderDispatchContext.job`. The same body is reused for the in-app channel.

## System-generated reminders (`lib/server/system-reminders.ts`)

- **Interview reminder** — one `SYSTEM` reminder per job, kept in sync with `Job.interviewAt`
  (default lead 24h) via `upsertInterviewReminder`, idempotent through `@@unique([jobId, systemKey])`
  (`systemKey = "interview"`). **Two times, kept apart** (the important bit): the row's `dueAt` is
  the **interview instant itself** — the only time ever shown to the user (To-do row, feed, interview
  card all read `dueAt`) — while the QStash delivery is scheduled at `fireAt = interviewAt - lead`
  (24h). `fireAt` lives only in the schedule (`notBefore`) and is never surfaced, so the user is
  never shown a "due yesterday" time for an interview that's tomorrow. (Earlier this stored `fireAt`
  in `dueAt`, which made the To-do read as a day-early "overdue" — that was the bug.) Set from the
  job page's "Interview" control; clearing the date deletes the reminder + cancels its QStash
  message. The picker bars past days (`disabled={{ before: today }}`) and floors the time at "now"
  when today is chosen, so an interview can't be set in the past. Server-side,
  `shouldScheduleInterviewReminder(interviewAt, now)` gates the QStash publish: an interview already
  in the past keeps its row (so the UI can show "passed") but is not scheduled, avoiding a
  fire-immediately nudge from a past `notBefore`. An interview inside the 24h lead window still
  schedules on purpose so the heads-up goes out right away.
- **Daily digest** — `runDigest(now)` emails every user whose `SAVED` jobs are untouched ≥ 3 days a
  single "needs attention" summary (in-app + email). Triggered by `POST /api/cron/reminders-digest`
  (QStash-signed) on a daily schedule.

  > **v1 limitation (deferred):** the digest uses **hardcoded defaults** (daily 08:00 UTC,
  > `staleAfterDays = 3`, all users). The `NotificationPreference` table exists in the schema but is
  > **not yet used** — there is no preferences service config, prefs API, or settings UI. The daily
  > cron schedule is the throttle (no per-user timezone/hour/cadence, no `lastDigestAt`). Wiring up
  > per-user preferences (+ a settings panel) is the natural next step.

## Extension local delivery (`extension/lib/reminder-alarms.js`)

No server push (avoids FCM/web-push infra). On a once-daily sync alarm (and after extension-side
reminder mutations / on install/startup), `syncReminderAlarms()` fetches
`GET /api/reminders?upcoming=1&days=30`, clears stale `reminder:*` alarms, and registers one
`chrome.alarms` per upcoming reminder at its `dueAt`. `onAlarm` fires a `chrome.notifications`;
clicking it opens the deep link. Requires the `alarms` + `notifications` permissions.

> **Known v1 gap:** reminders created on the web *after* the extension's last sync won't OS-notify
> until the next sync. Email + in-app cover that window.
>
> **Interview lead-time nuance:** the extension alarm keys off `dueAt`, which for an interview
> reminder is now the interview instant (not `fireAt`), so its local OS notification lands at the
> interview time rather than 24h before. The server QStash channel still delivers the 24h heads-up.
> Honoring the lead on the extension too would mean exposing `fireAt` on the DTO (deferred).

## Data model additions (`prisma/schema.prisma`)

- `Reminder`: `qstashMessageId?`, `deliveredAt?`, `systemKey?`, `@@unique([jobId, systemKey])`.
- `Job.interviewAt?`.
- New: `Notification`, `NotificationPreference` (defined, unused for now); enums `NotificationKind`,
  `DigestFrequency`.

> **Schema is applied with `prisma db push`, NOT `prisma migrate dev`.** This project is db-push
> managed and has no `prisma/migrations` folder — `migrate dev` would detect drift and offer to
> **reset the database**. Use `npm run db:push`.

## Environment variables

All optional — the app boots and degrades gracefully when absent (see `.env.example`).

| Var | Purpose |
| --- | --- |
| `QSTASH_TOKEN` | Publish one-shot deliveries + the digest cron. Unset → scheduler no-ops. |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Verify the signed worker/cron requests. |
| `RESEND_API_KEY` | Email channel. Unset → email sends no-op (in-app/extension still deliver). |
| `EMAIL_FROM` | Sending identity; must be a Resend-verified domain in prod. |
| `APP_URL` | Public origin QStash calls back to. **Must be publicly reachable** (not bare localhost). |

## Local development

QStash cannot reach a bare `localhost`, so to exercise firing end to end either:

1. **Public tunnel** (e.g. `ngrok http 3100` or `cloudflared tunnel --url http://localhost:3100`):
   set `APP_URL` to the public `https://…` URL, restart the dev server, create a reminder due in
   ~1 min, and watch the in-app notification appear (+ email if Resend is configured). The signed
   routes verify QStash's signature, so they can't be curled directly.
2. **Upstash QStash dev server** — `npx @upstash/qstash-cli dev` prints its own token + signing
   keys; put them in `.env` (replacing the production ones) and it reaches localhost directly.

Curl helpers + notes live in [`scripts/curl/`](../scripts/curl/).

## Production setup checklist

- [ ] Set prod env: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`,
      `RESEND_API_KEY`, `EMAIL_FROM` (verified domain), `APP_URL` (deployed origin).
- [ ] `npm run qstash:setup` once to register the daily digest cron at the deployed `APP_URL`.
- [ ] Send a test from the Upstash console to confirm the worker route verifies signatures.
- [ ] **Auth:** the app still uses the `DEV_USER_ID` no-auth stub — wire real auth (Clerk) before a
      public launch, since a public deployment otherwise exposes `/api/*` as the dev user.

## Testing

Logic-only unit tests (Vitest): scheduler math, the idempotent claim, copy builders, the
notification serializer, interview lead-time, and the digest stale-cutoff. Run `npm run test`.
Wiring/UI is verified via curl + manual checks (no Playwright).
