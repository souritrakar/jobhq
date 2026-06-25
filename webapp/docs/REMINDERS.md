# Reminders: scheduling, delivery & system generation

How reminders actually **fire** — delivered at their due time across the web app, email, and the
Chrome extension — plus the auto-generated interview reminders and the periodic digest.

Read [`BACKEND.md`](BACKEND.md) first for the route → validation → service → db layering and the
response envelope. The reminders **CRUD + feed** predate this; this doc covers the delivery layer
built on top.

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

## Channels (`lib/server/notification-dispatch.ts`)

Resolved per user via `resolveChannels(prefs)` — with no `NotificationPreference` row (the current
state), **all channels default on**.

- **Email** — Resend (`lib/email/client.ts` + `templates.ts`). No-ops with a warning when
  `RESEND_API_KEY` is unset. Templates are table-based inline-styled HTML; every interpolation is
  escaped and hrefs are restricted to `http(s)`.
- **In-app** — a `Notification` row (`lib/server/notifications.ts`), surfaced by the dashboard bell.
- **Extension** — delivered **locally**, not from the server (see below).
- Copy is shared/templated (`lib/reminders/copy.ts`); no LLM anywhere in reminders.

## System-generated reminders (`lib/server/system-reminders.ts`)

- **Interview reminder** — one `SYSTEM` reminder per job, kept in sync with `Job.interviewAt`
  (default lead 24h) via `upsertInterviewReminder`, idempotent through `@@unique([jobId, systemKey])`
  (`systemKey = "interview"`). Set from the job page's "Interview" control
  (`components/dashboard/job-detail/interview-date.tsx`); clearing the date deletes the reminder +
  cancels its QStash message.
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
