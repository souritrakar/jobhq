# Reminders: Scheduling, Delivery & System Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing reminders actually *fire* — deliver them at their due time across web app, email, and the Chrome extension — and add system-generated reminders (interview reminders + a periodic "jobs needing attention" digest), plus reminder-add UX in the extension.

**Architecture:** Upstash **QStash** is the scheduler (per-reminder one-shot delivery via `notBefore`, plus one recurring hourly cron for the digest). Our **worker** is a signed HTTP route (`/api/reminders/fire`) that QStash calls at the due time; it reads the reminder from Neon and dispatches to channels. The extension delivers **locally** via `chrome.alarms` + `chrome.notifications` (no server push), keeping the local-first model intact. Neon is the source of truth; QStash never touches the DB — it only carries a `reminderId`.

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + Neon, Zod, `@upstash/qstash`, `resend` (email), Vanilla JS MV3 extension, Vitest (new, logic-only tests).

---

## Current State (read this first — it changes the scope)

The reminders **CRUD + to-do layer already exists** and must be reused, not rebuilt:

- **Schema:** `Reminder` model in [prisma/schema.prisma](../../../webapp/prisma/schema.prisma) (`type: USER|SYSTEM`, `dueAt?`, `hasTime`, `done`, `jobId?`).
- **API:** `POST /api/reminders`, `PATCH|DELETE /api/reminders/[id]`, `GET|POST /api/jobs/[id]/reminders`.
- **Service:** [webapp/lib/server/reminders.ts](../../../webapp/lib/server/reminders.ts) (`listReminders`, `listJobReminders`, `createReminder`, `updateReminder`, `deleteReminder`, `toClientReminder`).
- **Validation:** [webapp/lib/validations/reminder.ts](../../../webapp/lib/validations/reminder.ts).
- **Client + types:** [webapp/lib/reminders/client.ts](../../../webapp/lib/reminders/client.ts), [webapp/lib/reminders/types.ts](../../../webapp/lib/reminders/types.ts).
- **Web UI:** `/dashboard/reminders` feed, per-job `reminders-card.tsx`, `reminder-popover.tsx`, `reminder-checkbox.tsx`; nav entry already present.

**What does NOT exist (this plan builds it):**
1. Any *firing* of reminders — nothing is scheduled or delivered. Today a reminder is just a row.
2. QStash integration (schedule on create, cancel/reschedule on edit, cancel on delete/done).
3. The worker route + multi-channel dispatch + idempotency.
4. **Email** capability (none in the codebase).
5. **In-app** notification surface (no bell, no toast, no `Notification` table).
6. **System reminders:** interview reminders, periodic "needs attention" digest.
7. **Extension:** any reminder UI, and any `alarms`/`notifications` usage (not in permissions).
8. **Notification preferences** (channels, timezone, digest cadence).

---

## Decisions & Assumptions (confirm or override before execution)

These are chosen for "simple, scalable, cost-effective" per the brief. Flag any you disagree with.

1. **Scheduler = QStash, two modes.** Per-reminder one-shot (`publishJSON` with `notBefore`) for dated user/interview reminders; **one hourly cron schedule** for the digest (lets us honor each user's local digest hour without per-user crons).
2. **Worker = one signed HTTP route**, no Celery/Redis/worker fleet (per our earlier discussion). QStash handles retries.
3. **Email = Resend.** Best fit for Next.js, generous free tier, one dependency. Requires a verified sending domain (`EMAIL_FROM`). You provide `RESEND_API_KEY`.
4. **In-app delivery = a `Notification` row + a bell in the dashboard header**, fetched on page load and revalidated on window focus. **No polling, no websockets** — matches the local-first, no-needless-reads principle. A fired reminder also remains visible in the existing reminders feed.
5. **Extension delivery = local `chrome.alarms` + `chrome.notifications`.** No server push (avoids FCM/web-push infra). Alarms are (re)registered when the extension syncs (on panel open + a once-daily sync alarm). Limitation: reminders created on the web after the last extension sync won't OS-notify until the next sync — acceptable for v1 because email + in-app cover it. Documented, not hidden.
6. **User reminders are one-shot** (fire once at `dueAt`). Recurring *user* reminders are out of scope for v1 (YAGNI); the "frequency" requirement is served by the system digest. Recurrence is a clean future extension (add a `recurrence` field + reschedule-on-fire).
7. **Interview reminders fire ahead of time**, not at the interview instant. Default lead = 24h before `interviewAt` (configurable later). One SYSTEM reminder per job, idempotent via `(jobId, systemKey)`.
8. **Digest selection (v1):** jobs with `status = SAVED` whose `updatedAt` is older than `staleAfterDays` (default 3). Counts + a small sample go into one email + one in-app notification. "Incomplete application" detection is a future refinement.
9. **No LLM** anywhere in reminders. Digest/email copy is templated. Keeps latency and cost at zero and avoids hallucinated content. (Optional AI summarization is a deliberate non-goal.)
10. **Testing:** introduce **Vitest** for pure logic only (scheduler math, idempotent claim, digest user-selection, copy builders). Wiring/UI verified via provided `curl` scripts and manual checks. **No Playwright / Chrome DevTools MCP** (per your instruction — they waste tokens here).

---

## Global Constraints (apply to every task)

- **Next.js 16 App Router**, Node runtime. Route `params` is a Promise — always `const { id } = await params`.
- **All DB access lives in `lib/server/*`**, never in route handlers. Every service function takes `userId` and scopes queries to it; single-row reads/writes filter by **both `id` and `userId`** (multi-tenant safety). *(Exception: QStash-signed worker/cron routes act system-wide and resolve the user from the row — they do not call `getUserId`.)*
- **Response envelope:** `ok(data)` → `{ data }`, `created(data)` → `{ data }` (201), errors thrown as `ApiError`, all wrapped in `withRoute()` with `OPTIONS = preflight`. *(Webhook routes are the exception — see Task 7.)*
- **Validation:** Zod schemas in `lib/validations/*`; inferred types flow into the service layer.
- **Prisma client:** `import { prisma } from "@/lib/db"`. Migrations via `npm run db:migrate` (uses `DIRECT_URL`).
- **Env:** add new vars to [webapp/lib/env.ts](../../../webapp/lib/env.ts) (Zod) **and** `.env.example`. New service keys are `.optional()` so the app still boots without them; code must degrade gracefully when a key is absent.
- **Extension:** vanilla JS, **no build step**; ship `.js` as-is. API base is `http://localhost:3100`. Auth today is the `x-user-id`/`DEV_USER_ID` dev seam — do not add a new auth mechanism.
- **Copy style:** no em dashes in user-facing strings (house style); match the warm-paper/Fern identity (web) and neutral-white/Fern (extension).
- **Paths in this doc** are relative to the repo root `/home/s7kar/linkedin-saas/jobtracker`. The Next.js app is under `webapp/`, the extension under `extension/`.

---

## Skills & Subagents

**Skills to invoke during execution (per task type):**
- **Backend logic & worker (Phases 0–4):** `superpowers:test-driven-development` for the pure-logic tasks (scheduler, idempotent claim, digest selection, copy builders). `claude-api` skill is **not** needed (no Claude/LLM here).
- **Extension (Phases 5–6):** `cext-manifest-v3` (adding `alarms`/`notifications` permissions), `cext-extension-apis` (alarms + notifications + storage), `cext-component-communication` (new message types), `cext-security-best-practices` (don't widen permissions; sanitize notification content).
- **Web UI (Phases 3, 8):** `interaction-design:feedback-patterns` and `interaction-design:error-handling-ux` for the bell/unread/empty states; `frontend-design` + `web-design-guidelines` + `react-best-practices` for the bell dropdown, settings form, and digest email layout; `design-systems` if extending tokens.
- **Email (Phase 2):** `web-design-guidelines` for accessible, table-based HTML email.

**Subagent strategy (subagent-driven-development):**
- Dispatch a **fresh subagent per task**, review between tasks (two-stage review).
- **Parallelizable:** Phases 5–6 (extension) are independent of Phases 1–4 (server) once Phase 0 schema + `GET /api/reminders` (Task 21) exist. They can run in a separate worktree concurrently. Phase 8 (settings UI) depends only on Phase 0's `NotificationPreference` model + Task 19 routes.
- **Strictly sequential:** Phase 0 → 1 → (2,3 in parallel) → 4. The worker (Task 7) must exist before channels are meaningful, but channels can be stubbed (Task 8) so the worker is testable first.
- **No visual-testing subagents.** Do not dispatch Playwright/DevTools runs.

---

## File Structure (new + modified)

**New (webapp):**
- `webapp/lib/reminders/scheduler.ts` — QStash client wrapper (schedule / cancel one-shot deliveries).
- `webapp/lib/server/reminder-delivery.ts` — `fireReminder()` + idempotent claim + channel fan-out.
- `webapp/lib/server/notifications.ts` — in-app `Notification` CRUD (user-scoped).
- `webapp/lib/server/notification-preferences.ts` — get/upsert prefs; channel resolution.
- `webapp/lib/server/system-reminders.ts` — interview-reminder upsert + digest run.
- `webapp/lib/notifications/types.ts`, `webapp/lib/notifications/client.ts` — client types + fetch helpers.
- `webapp/lib/email/client.ts` — Resend wrapper (`sendEmail`).
- `webapp/lib/email/templates.ts` — HTML builders (`reminderEmail`, `digestEmail`).
- `webapp/lib/reminders/copy.ts` — pure builders for notification title/body (shared by channels).
- `webapp/lib/validations/notification-preferences.ts` — Zod.
- `webapp/app/api/reminders/fire/route.ts` — **worker** (QStash-signed).
- `webapp/app/api/cron/reminders-digest/route.ts` — **digest cron** (QStash-signed).
- `webapp/app/api/reminders/route.ts` — extend with `GET` (list, `?upcoming=`).
- `webapp/app/api/notifications/route.ts`, `webapp/app/api/notifications/[id]/route.ts`, `webapp/app/api/notifications/read-all/route.ts`.
- `webapp/app/api/notification-preferences/route.ts`.
- `webapp/components/dashboard/notifications-bell.tsx` — header bell + dropdown.
- `webapp/components/dashboard/settings/notification-settings.tsx` — prefs form.
- `webapp/scripts/setup-qstash-schedules.ts` — one-time digest cron registration.
- `webapp/scripts/curl/*.sh` — manual verification scripts.
- `webapp/vitest.config.ts`, `webapp/lib/**/*.test.ts` — logic tests.

**New (extension):**
- `extension/ui/reminders.js` — reminders section renderer for the save panel.
- `extension/lib/reminder-alarms.js` — alarm reconciliation + notification handlers (loaded by `background.js`).

**Modified (webapp):**
- `prisma/schema.prisma` (Reminder fields; `Notification`, `NotificationPreference`, `DigestFrequency`, `NotificationKind`; `Job.interviewAt`; `User` relations).
- `lib/env.ts`, `.env.example` (QStash, Resend, APP_URL).
- `lib/server/reminders.ts` (schedule/cancel on create/update/delete).
- `lib/server/jobs.ts` + `lib/validations/job.ts` (accept `interviewAt`; trigger interview reminder).
- `components/dashboard/dashboard-shell.tsx` (mount the bell; pass initial unread).
- `app/dashboard/layout.tsx` or shell data loader (fetch initial notifications).
- `app/dashboard/settings/page.tsx` (mount notification settings).
- `package.json` (deps: `@upstash/qstash`, `resend`; devDeps: `vitest`; script: `test`, `qstash:setup`).

**Modified (extension):**
- `extension/manifest.json` (`alarms`, `notifications` permissions).
- `extension/background.js` (new message handlers; import alarm module; `onAlarm`/`onClicked` listeners).
- `extension/content.js` (extend per-posting record with `reminders`; sync alarms after save/revalidate).
- `extension/ui/modal.js` (mount the reminders section in the Details tab).

---

# PHASE 0 — Foundations (schema, env, deps, test harness)

### Task 1: Add Vitest harness

**Files:**
- Create: `webapp/vitest.config.ts`
- Modify: `webapp/package.json`
- Test: `webapp/lib/reminders/copy.test.ts` (placeholder proving the harness runs)

**Interfaces:**
- Produces: `npm run test` (vitest), importable `@/` alias in tests.

- [ ] **Step 1: Install Vitest**

```bash
cd webapp && npm i -D vitest vite-tsconfig-paths
```

- [ ] **Step 2: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
})
```

- [ ] **Step 3: Add scripts to `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test** at `webapp/lib/reminders/copy.test.ts`

```typescript
import { describe, expect, it } from "vitest"

describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it**

Run: `cd webapp && npm run test`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add webapp/vitest.config.ts webapp/package.json webapp/package-lock.json webapp/lib/reminders/copy.test.ts
git commit -m "test: add vitest harness for reminders logic"
```

---

### Task 2: Install runtime dependencies

**Files:** Modify: `webapp/package.json`

- [ ] **Step 1: Install**

```bash
cd webapp && npm i @upstash/qstash resend
```

- [ ] **Step 2: Verify they resolve**

Run: `cd webapp && node -e "require('@upstash/qstash'); require('resend'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add webapp/package.json webapp/package-lock.json
git commit -m "chore: add @upstash/qstash and resend deps"
```

---

### Task 3: Extend env schema

**Files:** Modify: `webapp/lib/env.ts`, `webapp/.env.example`

**Interfaces:**
- Produces: `env.QSTASH_TOKEN?`, `env.QSTASH_CURRENT_SIGNING_KEY?`, `env.QSTASH_NEXT_SIGNING_KEY?`, `env.RESEND_API_KEY?`, `env.EMAIL_FROM` (string, defaulted), `env.APP_URL` (string, defaulted to `http://localhost:3100`).

- [ ] **Step 1: Add fields to the Zod schema** in `lib/env.ts` (inside `envSchema`)

```typescript
  // Upstash QStash (reminder scheduling + digest cron)
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),

  // Resend (reminder + digest email)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("JobTracker <reminders@jobtracker.app>"),

  // Public base URL QStash calls back to (the worker + digest cron live here).
  // In prod this is the deployed origin; in local dev it must be a public tunnel
  // (the QStash dev server handles localhost — see scripts/curl/README).
  APP_URL: z.string().url().default("http://localhost:3100"),
```

- [ ] **Step 2: Mirror into `.env.example`** (add commented entries with the same names + a one-line note that `APP_URL` must be publicly reachable by QStash in prod).

- [ ] **Step 3: Boot-check**

Run: `cd webapp && npx tsx -e "import('@/lib/env').then(m => console.log(Object.keys(m.env).length))"`
Expected: prints a number (no validation throw).

- [ ] **Step 4: Commit**

```bash
git add webapp/lib/env.ts webapp/.env.example
git commit -m "feat: env vars for qstash, resend, app url"
```

---

### Task 4: Schema migration — reminder delivery fields, Notification, NotificationPreference, Job.interviewAt

**Files:** Modify: `webapp/prisma/schema.prisma`; generate a migration.

**Interfaces:**
- Produces: new columns `Reminder.qstashMessageId?`, `Reminder.deliveredAt?`, `Reminder.systemKey?`; `Job.interviewAt?`; models `Notification`, `NotificationPreference`; enums `DigestFrequency`, `NotificationKind`; `User.notifications`, `User.notificationPreference` relations.

- [ ] **Step 1: Edit `Reminder` model** — add fields and a uniqueness guard for system reminders:

```prisma
model Reminder {
  id     String       @id @default(cuid())
  userId String
  user   User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobId  String?
  job    Job?         @relation(fields: [jobId], references: [id], onDelete: Cascade)

  title   String
  type    ReminderType @default(USER)
  dueAt   DateTime?
  hasTime Boolean      @default(false)
  done    Boolean      @default(false)

  // --- delivery (added) ---
  qstashMessageId String?   // scheduled one-shot message id; null = not scheduled
  deliveredAt     DateTime? // set atomically when the server-side delivery fires (idempotency)
  systemKey       String?   // for SYSTEM reminders: stable key per job (e.g. "interview")

  notifications Notification[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([jobId, systemKey])   // one interview reminder per job; upsert-friendly
  @@index([userId, done])
  @@index([userId, dueAt])
  @@index([jobId])
  @@map("reminders")
}
```

- [ ] **Step 2: Add `interviewAt` to `Job`** (place beside `deadline`):

```prisma
  deadline    DateTime?
  interviewAt DateTime?
```

- [ ] **Step 3: Add enums + models** (anywhere in the file):

```prisma
enum DigestFrequency {
  DAILY
  WEEKLY
  OFF
}

enum NotificationKind {
  REMINDER_DUE
  INTERVIEW
  DIGEST
}

model Notification {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  reminderId String?
  reminder   Reminder? @relation(fields: [reminderId], references: [id], onDelete: SetNull)
  jobId      String?

  kind  NotificationKind
  title String
  body  String? @db.Text
  href  String?            // deep link, e.g. /dashboard/jobs/:id

  readAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId, readAt])
  @@index([userId, createdAt])
  @@map("notifications")
}

model NotificationPreference {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  timezone         String          @default("UTC") // IANA tz, e.g. "America/New_York"
  emailEnabled     Boolean         @default(true)
  inAppEnabled     Boolean         @default(true)
  extensionEnabled Boolean         @default(true)

  digestEnabled   Boolean         @default(true)
  digestFrequency DigestFrequency @default(DAILY)
  digestHour      Int             @default(8)  // local hour 0-23
  staleAfterDays  Int             @default(3)  // SAVED + untouched ≥ this many days → "needs attention"
  lastDigestAt    DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("notification_preferences")
}
```

- [ ] **Step 4: Add relations to `User`** (in the `User` model's relation block):

```prisma
  notifications          Notification[]
  notificationPreference NotificationPreference?
```

- [ ] **Step 5: Generate + apply migration**

Run: `cd webapp && npm run db:migrate -- --name reminders_delivery`
Expected: migration created and applied; `npm run db:generate` runs via Prisma.

- [ ] **Step 6: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors (note: `lib/server/reminders.ts` still compiles; new fields are additive).

- [ ] **Step 7: Commit**

```bash
git add webapp/prisma/schema.prisma webapp/prisma/migrations
git commit -m "feat: schema for reminder delivery, notifications, prefs, interviewAt"
```

---

# PHASE 1 — Scheduling layer (QStash wrapper + wire into reminder CRUD)

### Task 5: QStash scheduler wrapper

**Files:**
- Create: `webapp/lib/reminders/scheduler.ts`
- Test: `webapp/lib/reminders/scheduler.test.ts`

**Interfaces:**
- Produces:
  - `schedulerEnabled(): boolean`
  - `scheduleReminderDelivery(reminderId: string, fireAt: Date): Promise<string | null>` — returns QStash `messageId`, or `null` when disabled/failed.
  - `cancelScheduledDelivery(messageId: string | null | undefined): Promise<void>` — no-op when disabled/empty; swallows 404 (already delivered/cancelled).
- Consumes: `env` (Task 3).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest"

const publishJSON = vi.fn()
const del = vi.fn()
vi.mock("@upstash/qstash", () => ({
  Client: vi.fn(() => ({ publishJSON, messages: { delete: del } })),
}))
vi.mock("@/lib/env", () => ({
  env: { QSTASH_TOKEN: "tok", APP_URL: "https://app.test" },
}))

beforeEach(() => {
  publishJSON.mockReset()
  del.mockReset()
})

describe("scheduleReminderDelivery", () => {
  it("publishes with notBefore in epoch seconds and returns messageId", async () => {
    publishJSON.mockResolvedValue({ messageId: "m1" })
    const { scheduleReminderDelivery } = await import("./scheduler")
    const fireAt = new Date("2030-01-01T00:00:00.000Z")
    const id = await scheduleReminderDelivery("r1", fireAt)
    expect(id).toBe("m1")
    expect(publishJSON).toHaveBeenCalledWith({
      url: "https://app.test/api/reminders/fire",
      body: { reminderId: "r1" },
      notBefore: Math.floor(fireAt.getTime() / 1000),
    })
  })

  it("swallows delete errors", async () => {
    del.mockRejectedValue(new Error("404"))
    const { cancelScheduledDelivery } = await import("./scheduler")
    await expect(cancelScheduledDelivery("m1")).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './scheduler'`)

Run: `cd webapp && npx vitest run lib/reminders/scheduler.test.ts`

- [ ] **Step 3: Implement `scheduler.ts`**

```typescript
import { Client } from "@upstash/qstash"

import { env } from "@/lib/env"

// One module-level client. Null when QSTASH_TOKEN is unset (local dev without a
// tunnel / CI) — every function then no-ops so reminder CRUD still works.
const client = env.QSTASH_TOKEN ? new Client({ token: env.QSTASH_TOKEN }) : null

export function schedulerEnabled(): boolean {
  return client !== null
}

/**
 * Schedule a one-shot delivery for a reminder at `fireAt`. Returns the QStash
 * messageId (store it on the row so the delivery can be cancelled/rescheduled)
 * or null when scheduling is disabled or fails. Failure is non-fatal: the
 * reminder is still saved, it just won't fire (surfaced via logs).
 */
export async function scheduleReminderDelivery(
  reminderId: string,
  fireAt: Date,
): Promise<string | null> {
  if (!client) return null
  try {
    const res = await client.publishJSON({
      url: `${env.APP_URL}/api/reminders/fire`,
      body: { reminderId },
      notBefore: Math.floor(fireAt.getTime() / 1000),
    })
    return res.messageId
  } catch (err) {
    console.error("[scheduler] failed to schedule reminder", reminderId, err)
    return null
  }
}

/** Cancel a scheduled delivery. No-op if disabled or already delivered/cancelled. */
export async function cancelScheduledDelivery(
  messageId: string | null | undefined,
): Promise<void> {
  if (!client || !messageId) return
  try {
    await client.messages.delete(messageId)
  } catch (err) {
    // 404 = already delivered or cancelled. Anything else is logged, not thrown.
    console.warn("[scheduler] cancel failed (likely already delivered)", messageId, err)
  }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd webapp && npx vitest run lib/reminders/scheduler.test.ts`

- [ ] **Step 5: Commit**

```bash
git add webapp/lib/reminders/scheduler.ts webapp/lib/reminders/scheduler.test.ts
git commit -m "feat: qstash scheduler wrapper for reminder delivery"
```

---

### Task 6: Wire scheduling into the reminders service

**Files:** Modify: `webapp/lib/server/reminders.ts`

**Interfaces:**
- Consumes: `scheduleReminderDelivery`, `cancelScheduledDelivery` (Task 5).
- Behavior contract (used by Task 7 + tests):
  - A reminder is **deliverable** iff `dueAt != null && !done`.
  - On **create**: if deliverable, schedule and persist `qstashMessageId`.
  - On **update**: recompute deliverability and the `dueAt`. If `dueAt` or `done` changed, **cancel the old message**, and (if still deliverable) schedule a new one; reset `deliveredAt` to `null` whenever a *new* delivery is scheduled (so a rescheduled reminder can fire again).
  - On **delete**: cancel the old message.

- [ ] **Step 1: Add a private helper** at the top of the service module:

```typescript
import { cancelScheduledDelivery, scheduleReminderDelivery } from "@/lib/reminders/scheduler"

// A reminder fires only if it has a due date and isn't already done.
function isDeliverable(dueAt: Date | null, done: boolean): boolean {
  return dueAt != null && !done
}
```

- [ ] **Step 2: Update `createReminder`** — after the `prisma.reminder.create(...)` that yields `row`, schedule and persist the message id:

```typescript
  if (isDeliverable(row.dueAt, row.done)) {
    const messageId = await scheduleReminderDelivery(row.id, row.dueAt!)
    if (messageId) {
      await prisma.reminder.update({ where: { id: row.id }, data: { qstashMessageId: messageId } })
      row.qstashMessageId = messageId
    }
  }
  return toClientReminder(row)
```

- [ ] **Step 3: Update `updateReminder`** — replace the body so it reschedules around the existing message. Load the current row first (need `qstashMessageId`, `dueAt`, `done`):

```typescript
export async function updateReminder(
  userId: string,
  id: string,
  input: UpdateReminderInput,
): Promise<Reminder> {
  const existing = await prisma.reminder.findFirst({
    where: { id, userId },
    select: { id: true, qstashMessageId: true, dueAt: true, done: true },
  })
  if (!existing) throw ApiError.notFound("Reminder not found")

  // Resolve the next state from the patch (undefined = unchanged).
  const nextDueAt = input.dueAt !== undefined ? input.dueAt : existing.dueAt
  const nextDone = input.done !== undefined ? input.done : existing.done
  const timingChanged =
    (input.dueAt !== undefined &&
      (input.dueAt?.getTime() ?? null) !== (existing.dueAt?.getTime() ?? null)) ||
    (input.done !== undefined && input.done !== existing.done)

  let qstashMessageId: string | null = existing.qstashMessageId
  let resetDelivered = false
  if (timingChanged) {
    await cancelScheduledDelivery(existing.qstashMessageId)
    qstashMessageId = null
    if (isDeliverable(nextDueAt ?? null, nextDone)) {
      qstashMessageId = await scheduleReminderDelivery(id, nextDueAt as Date)
      resetDelivered = true // a freshly scheduled delivery is allowed to fire again
    }
  }

  const row = await prisma.reminder.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.done !== undefined ? { done: input.done } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      ...(input.hasTime !== undefined ? { hasTime: input.hasTime } : {}),
      ...(timingChanged ? { qstashMessageId } : {}),
      ...(resetDelivered ? { deliveredAt: null } : {}),
    },
    include: { job: { select: jobSelect } },
  })
  return toClientReminder(row)
}
```

- [ ] **Step 4: Update `deleteReminder`** — cancel before deleting. Change the `select` to also fetch `qstashMessageId`:

```typescript
export async function deleteReminder(userId: string, id: string): Promise<void> {
  const existing = await prisma.reminder.findFirst({
    where: { id, userId },
    select: { id: true, qstashMessageId: true },
  })
  if (!existing) throw ApiError.notFound("Reminder not found")
  await cancelScheduledDelivery(existing.qstashMessageId)
  await prisma.reminder.delete({ where: { id } })
}
```

- [ ] **Step 5: Typecheck + run existing tests**

Run: `cd webapp && npm run typecheck && npm run test`
Expected: passes (scheduler is mocked-out via disabled mode when `QSTASH_TOKEN` unset at runtime; here we only typecheck).

- [ ] **Step 6: Commit**

```bash
git add webapp/lib/server/reminders.ts
git commit -m "feat: schedule/cancel qstash delivery on reminder create/update/delete"
```

---

### Task 7: The worker route (QStash-signed) + delivery skeleton

**Files:**
- Create: `webapp/lib/server/reminder-delivery.ts`
- Create: `webapp/app/api/reminders/fire/route.ts`
- Test: `webapp/lib/server/reminder-delivery.test.ts`

**Interfaces:**
- Produces: `fireReminder(reminderId: string): Promise<{ delivered: boolean }>`. Idempotent: a second call (QStash retry) returns `{ delivered: false }` and sends nothing.
- Consumes (stubbed in Task 8 → real in Tasks 9/12): `dispatchReminderChannels(ctx)`.

- [ ] **Step 1: Write the failing test** (idempotent claim is the critical invariant)

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest"

const updateMany = vi.fn()
const findUnique = vi.fn()
const dispatch = vi.fn()
vi.mock("@/lib/db", () => ({
  prisma: { reminder: { updateMany, findUnique } },
}))
vi.mock("@/lib/server/notification-dispatch", () => ({
  dispatchReminderChannels: dispatch,
}))

beforeEach(() => {
  updateMany.mockReset(); findUnique.mockReset(); dispatch.mockReset()
})

describe("fireReminder", () => {
  it("claims atomically and dispatches once", async () => {
    updateMany.mockResolvedValue({ count: 1 })
    findUnique.mockResolvedValue({
      id: "r1", userId: "u1", title: "Ping", jobId: null, kind: undefined,
      user: { email: "a@b.com", notificationPreference: null }, job: null,
    })
    const { fireReminder } = await import("./reminder-delivery")
    const res = await fireReminder("r1")
    expect(res.delivered).toBe(true)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it("no-ops when the claim is lost (already delivered / done)", async () => {
    updateMany.mockResolvedValue({ count: 0 })
    const { fireReminder } = await import("./reminder-delivery")
    const res = await fireReminder("r1")
    expect(res.delivered).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd webapp && npx vitest run lib/server/reminder-delivery.test.ts`

- [ ] **Step 3: Create the dispatch seam** `webapp/lib/server/notification-dispatch.ts` (stub now; filled in Tasks 9/12):

```typescript
import type { Reminder, User } from "@prisma/client"

export type ReminderDispatchContext = {
  reminder: Pick<Reminder, "id" | "title" | "jobId" | "type">
  user: Pick<User, "id" | "email">
  // resolved channel switches + deep link, filled by the delivery module
  channels: { inApp: boolean; email: boolean }
  href: string | null
}

// Stub: channels wired in Phase 2 (email) and Phase 3 (in-app).
export async function dispatchReminderChannels(_ctx: ReminderDispatchContext): Promise<void> {
  // no-op until channels land
}
```

- [ ] **Step 4: Implement `reminder-delivery.ts`** with the atomic claim:

```typescript
import { prisma } from "@/lib/db"
import { dispatchReminderChannels } from "@/lib/server/notification-dispatch"
import { resolveChannels } from "@/lib/server/notification-preferences"

/**
 * Fire a reminder. Called by the QStash worker at the due time (and possibly
 * again on retry). The atomic `updateMany ... WHERE deliveredAt IS NULL AND
 * NOT done` is the idempotency guard: exactly one caller wins the claim, so we
 * never double-send even under concurrent retries. Channel sends after the
 * claim are best-effort (logged, not rolled back) — at-most-once per channel.
 */
export async function fireReminder(reminderId: string): Promise<{ delivered: boolean }> {
  const claim = await prisma.reminder.updateMany({
    where: { id: reminderId, deliveredAt: null, done: false },
    data: { deliveredAt: new Date() },
  })
  if (claim.count === 0) return { delivered: false }

  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
    select: {
      id: true, title: true, jobId: true, type: true, userId: true,
      user: { select: { id: true, email: true, notificationPreference: true } },
    },
  })
  if (!reminder) return { delivered: false }

  const channels = resolveChannels(reminder.user.notificationPreference)
  const href = reminder.jobId ? `/dashboard/jobs/${reminder.jobId}` : `/dashboard/reminders`

  await dispatchReminderChannels({
    reminder: { id: reminder.id, title: reminder.title, jobId: reminder.jobId, type: reminder.type },
    user: { id: reminder.user.id, email: reminder.user.email },
    channels: { inApp: channels.inApp, email: channels.email },
    href,
  })
  return { delivered: true }
}
```

- [ ] **Step 5: Add `resolveChannels`** to a new `webapp/lib/server/notification-preferences.ts` (full prefs service comes in Task 19; this minimal piece is needed now):

```typescript
import type { NotificationPreference } from "@prisma/client"

export type ResolvedChannels = { inApp: boolean; email: boolean; extension: boolean }

// Defaults when a user has no prefs row yet: everything on.
export function resolveChannels(prefs: NotificationPreference | null): ResolvedChannels {
  if (!prefs) return { inApp: true, email: true, extension: true }
  return { inApp: prefs.inAppEnabled, email: prefs.emailEnabled, extension: prefs.extensionEnabled }
}
```

- [ ] **Step 6: Run — expect PASS**

Run: `cd webapp && npx vitest run lib/server/reminder-delivery.test.ts`

- [ ] **Step 7: Create the worker route** `webapp/app/api/reminders/fire/route.ts`:

```typescript
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs"

import { fireReminder } from "@/lib/server/reminder-delivery"

// QStash calls this at a reminder's due time with { reminderId }. The signature
// wrapper rejects anything not signed by QStash (uses QSTASH_CURRENT/NEXT_SIGNING_KEY
// from env). NOT wrapped in withRoute — it's a machine webhook, not a CORS API.
async function handler(req: Request) {
  const { reminderId } = (await req.json()) as { reminderId?: string }
  if (!reminderId) return Response.json({ error: "reminderId required" }, { status: 400 })
  const res = await fireReminder(reminderId)
  return Response.json({ ok: true, ...res })
}

export const POST = verifySignatureAppRouter(handler)
```

- [ ] **Step 8: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add webapp/lib/server/reminder-delivery.ts webapp/lib/server/notification-dispatch.ts webapp/lib/server/notification-preferences.ts webapp/app/api/reminders/fire/route.ts webapp/lib/server/reminder-delivery.test.ts
git commit -m "feat: signed qstash worker route + idempotent fireReminder"
```

---

# PHASE 2 — Email channel (Resend)

### Task 8: Reminder copy builders (pure)

**Files:**
- Create: `webapp/lib/reminders/copy.ts`
- Test: extend `webapp/lib/reminders/copy.test.ts`

**Interfaces:**
- Produces:
  - `reminderNotificationCopy(input: { title: string; company?: string | null }): { title: string; body: string }`
  - `digestCopy(input: { count: number; sample: { title: string; company: string }[] }): { title: string; body: string }`
- These are shared by email + in-app so wording stays consistent. No em dashes.

- [ ] **Step 1: Write failing tests** (replace the smoke test contents):

```typescript
import { describe, expect, it } from "vitest"
import { digestCopy, reminderNotificationCopy } from "./copy"

describe("reminderNotificationCopy", () => {
  it("includes the title and company", () => {
    const c = reminderNotificationCopy({ title: "Follow up", company: "Acme" })
    expect(c.title).toContain("Follow up")
    expect(c.body).toContain("Acme")
    expect(c.title).not.toContain("—")
  })
})

describe("digestCopy", () => {
  it("summarizes the count", () => {
    const c = digestCopy({ count: 3, sample: [{ title: "SWE", company: "Acme" }] })
    expect(c.title).toContain("3")
  })
  it("handles a single job", () => {
    const c = digestCopy({ count: 1, sample: [{ title: "SWE", company: "Acme" }] })
    expect(c.title.toLowerCase()).toContain("job")
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd webapp && npx vitest run lib/reminders/copy.test.ts`

- [ ] **Step 3: Implement `copy.ts`**

```typescript
export function reminderNotificationCopy(input: { title: string; company?: string | null }): {
  title: string
  body: string
} {
  const title = input.title
  const body = input.company
    ? `Reminder for ${input.company}: ${input.title}`
    : `Reminder: ${input.title}`
  return { title, body }
}

export function digestCopy(input: {
  count: number
  sample: { title: string; company: string }[]
}): { title: string; body: string } {
  const noun = input.count === 1 ? "job" : "jobs"
  const title = `You have ${input.count} ${noun} that need attention`
  const lines = input.sample.map((j) => `• ${j.title} at ${j.company}`).join("\n")
  const more = input.count > input.sample.length ? `\nand ${input.count - input.sample.length} more.` : ""
  const body = `These saved roles have been sitting untouched:\n${lines}${more}`
  return { title, body }
}
```

- [ ] **Step 4: Run — expect PASS**, then commit:

```bash
git add webapp/lib/reminders/copy.ts webapp/lib/reminders/copy.test.ts
git commit -m "feat: shared reminder/digest copy builders"
```

---

### Task 9: Resend email client + templates + wire into dispatch

**Files:**
- Create: `webapp/lib/email/client.ts`, `webapp/lib/email/templates.ts`
- Modify: `webapp/lib/server/notification-dispatch.ts`

**Interfaces:**
- Produces: `sendEmail({ to, subject, html }): Promise<void>` (no-op + warn when `RESEND_API_KEY` unset); `reminderEmail(copy, href)`, `digestEmail(copy, href)` → HTML strings.
- Modifies dispatch stub to actually send email when `ctx.channels.email`.

- [ ] **Step 1: Implement `email/client.ts`**

```typescript
import { Resend } from "resend"

import { env } from "@/lib/env"

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY unset — skipping send to", input.to)
    return
  }
  try {
    await resend.emails.send({ from: env.EMAIL_FROM, to: input.to, subject: input.subject, html: input.html })
  } catch (err) {
    console.error("[email] send failed", input.to, err)
  }
}
```

- [ ] **Step 2: Implement `email/templates.ts`** — table-based, inline-styled, accessible (warm-paper/Fern). A single `shell()` wraps each body:

```typescript
import { env } from "@/lib/env"

function shell(heading: string, bodyHtml: string, cta: { label: string; href: string }): string {
  const url = cta.href.startsWith("http") ? cta.href : `${env.APP_URL}${cta.href}`
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:14px;padding:28px">
      <tr><td style="font-size:18px;font-weight:700;padding-bottom:12px">${heading}</td></tr>
      <tr><td style="font-size:14px;line-height:1.6;color:#444">${bodyHtml}</td></tr>
      <tr><td style="padding-top:20px">
        <a href="${url}" style="background:#3f9b6a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:9px;display:inline-block;font-size:14px;font-weight:600">${cta.label}</a>
      </td></tr>
      <tr><td style="padding-top:24px;font-size:11px;color:#999">JobTracker. Manage reminders in your dashboard settings.</td></tr>
    </table>
  </td></tr></table></body></html>`
}

export function reminderEmail(copy: { title: string; body: string }, href: string): string {
  return shell(copy.title, escapeHtml(copy.body), { label: "View in JobTracker", href })
}

export function digestEmail(copy: { title: string; body: string }, href: string): string {
  const html = escapeHtml(copy.body).replace(/\n/g, "<br>")
  return shell(copy.title, html, { label: "Review jobs", href })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
```

- [ ] **Step 3: Fill the dispatch seam** in `notification-dispatch.ts` — replace the stub body. (The in-app branch is added in Task 12; for now only email is real.)

```typescript
import { sendEmail } from "@/lib/email/client"
import { reminderEmail } from "@/lib/email/templates"
import { reminderNotificationCopy } from "@/lib/reminders/copy"
// (keep the existing ReminderDispatchContext type export)

export async function dispatchReminderChannels(ctx: ReminderDispatchContext): Promise<void> {
  const copy = reminderNotificationCopy({ title: ctx.reminder.title })
  if (ctx.channels.email) {
    await sendEmail({
      to: ctx.user.email,
      subject: copy.title,
      html: reminderEmail(copy, ctx.href ?? "/dashboard/reminders"),
    })
  }
  // in-app branch added in Task 12
}
```

- [ ] **Step 4: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verify** (only if you have a `RESEND_API_KEY` + verified domain): create a reminder due in ~1 min via the UI, expose `APP_URL` through the QStash dev server (Task 11 README), and confirm the email arrives. Otherwise rely on the unit-tested copy + a logged "skipping send" line.

- [ ] **Step 6: Commit**

```bash
git add webapp/lib/email webapp/lib/server/notification-dispatch.ts
git commit -m "feat: resend email channel for reminders"
```

---

# PHASE 3 — In-app channel (Notification model surface)

### Task 10: Notifications service + types + client

**Files:**
- Create: `webapp/lib/server/notifications.ts`, `webapp/lib/notifications/types.ts`, `webapp/lib/notifications/client.ts`
- Test: `webapp/lib/server/notifications.test.ts` (serializer only — pure)

**Interfaces:**
- Produces (service):
  - `createNotification(userId, input: { kind, title, body?, href?, reminderId?, jobId? }): Promise<NotificationDto>`
  - `listNotifications(userId, opts?: { limit?: number }): Promise<NotificationDto[]>`
  - `unreadCount(userId): Promise<number>`
  - `markRead(userId, id): Promise<void>`; `markAllRead(userId): Promise<void>`
  - `toClientNotification(row): NotificationDto`
- Produces (client type) `NotificationDto = { id, kind, title, body?, href?, readAt?: string, createdAt: string }`.

- [ ] **Step 1: Define the client type** `lib/notifications/types.ts`:

```typescript
export type NotificationKind = "reminder" | "interview" | "digest"

export type NotificationDto = {
  id: string
  kind: NotificationKind
  title: string
  body?: string
  href?: string
  readAt?: string
  createdAt: string
}
```

- [ ] **Step 2: Write failing serializer test** `lib/server/notifications.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { toClientNotification } from "./notifications"

describe("toClientNotification", () => {
  it("maps enum + dates to the wire shape", () => {
    const dto = toClientNotification({
      id: "n1", kind: "REMINDER_DUE", title: "t", body: null, href: "/x",
      readAt: null, createdAt: new Date("2030-01-01T00:00:00Z"),
    } as never)
    expect(dto.kind).toBe("reminder")
    expect(dto.createdAt).toBe("2030-01-01T00:00:00.000Z")
    expect(dto.readAt).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run — expect FAIL**, then implement `lib/server/notifications.ts`:

```typescript
import type { Notification, Prisma } from "@prisma/client"

import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import type { NotificationDto, NotificationKind } from "@/lib/notifications/types"

const KIND_TO_CLIENT: Record<Notification["kind"], NotificationKind> = {
  REMINDER_DUE: "reminder",
  INTERVIEW: "interview",
  DIGEST: "digest",
}

export function toClientNotification(row: Notification): NotificationDto {
  return {
    id: row.id,
    kind: KIND_TO_CLIENT[row.kind],
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    ...(row.body ? { body: row.body } : {}),
    ...(row.href ? { href: row.href } : {}),
    ...(row.readAt ? { readAt: row.readAt.toISOString() } : {}),
  }
}

export async function createNotification(
  userId: string,
  input: {
    kind: Notification["kind"]
    title: string
    body?: string
    href?: string
    reminderId?: string
    jobId?: string
  },
): Promise<NotificationDto> {
  const row = await prisma.notification.create({
    data: {
      user: { connect: { id: userId } },
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href,
      reminderId: input.reminderId,
      jobId: input.jobId,
    },
  })
  return toClientNotification(row)
}

export async function listNotifications(
  userId: string,
  opts?: { limit?: number },
): Promise<NotificationDto[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 30,
  })
  return rows.map(toClientNotification)
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } })
}

export async function markRead(userId: string, id: string): Promise<void> {
  const res = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  })
  if (res.count === 0) {
    const exists = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } })
    if (!exists) throw ApiError.notFound("Notification not found")
  }
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Implement the browser client** `lib/notifications/client.ts` (mirror `lib/reminders/client.ts`'s `request<T>` envelope-unwrapping):

```typescript
import type { NotificationDto } from "./types"

type Envelope<T> = { data?: T; error?: { message?: string } }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || body?.data === undefined) {
    throw new Error(body?.error?.message ?? "Something went wrong. Try again.")
  }
  return body.data
}

export function listNotifications(): Promise<NotificationDto[]> {
  return request<NotificationDto[]>("/api/notifications")
}
export function markNotificationRead(id: string): Promise<{ id: string }> {
  return request(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ read: true }) })
}
export function markAllNotificationsRead(): Promise<{ ok: true }> {
  return request("/api/notifications/read-all", { method: "POST" })
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/lib/server/notifications.ts webapp/lib/notifications webapp/lib/server/notifications.test.ts
git commit -m "feat: in-app notifications service + client"
```

---

### Task 11: Notifications API routes

**Files:**
- Create: `webapp/app/api/notifications/route.ts`, `webapp/app/api/notifications/[id]/route.ts`, `webapp/app/api/notifications/read-all/route.ts`

**Interfaces:**
- `GET /api/notifications` → `{ data: NotificationDto[] }`
- `PATCH /api/notifications/:id` `{ read: true }` → `{ data: { id } }`
- `POST /api/notifications/read-all` → `{ data: { ok: true } }`

- [ ] **Step 1: `app/api/notifications/route.ts`**

```typescript
import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { listNotifications } from "@/lib/server/notifications"

export const GET = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  return ok(await listNotifications(userId))
})

export const OPTIONS = preflight
```

- [ ] **Step 2: `app/api/notifications/[id]/route.ts`**

```typescript
import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { markRead } from "@/lib/server/notifications"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = getUserId(req)
  const { id } = await params
  await markRead(userId, id)
  return ok({ id })
})

export const OPTIONS = preflight
```

- [ ] **Step 3: `app/api/notifications/read-all/route.ts`**

```typescript
import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { markAllRead } from "@/lib/server/notifications"

export const POST = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  await markAllRead(userId)
  return ok({ ok: true })
})

export const OPTIONS = preflight
```

- [ ] **Step 4: Verify with curl** (dev server running, `DEV_USER_ID` seeded):

```bash
curl -s localhost:3100/api/notifications | head
```
Expected: `{"data":[]}` (empty until a reminder fires).

- [ ] **Step 5: Commit**

```bash
git add webapp/app/api/notifications
git commit -m "feat: notifications api routes"
```

---

### Task 12: Wire in-app delivery into dispatch

**Files:** Modify: `webapp/lib/server/notification-dispatch.ts`

- [ ] **Step 1: Add the in-app branch** (after the email branch) using `createNotification`:

```typescript
import { createNotification } from "@/lib/server/notifications"
// ...
  if (ctx.channels.inApp) {
    await createNotification(ctx.user.id, {
      kind: "REMINDER_DUE",
      title: copy.title,
      body: copy.body,
      href: ctx.href ?? undefined,
      reminderId: ctx.reminder.id,
      jobId: ctx.reminder.jobId ?? undefined,
    })
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd webapp && npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add webapp/lib/server/notification-dispatch.ts
git commit -m "feat: in-app notification on reminder fire"
```

---

### Task 13: Notifications bell in the dashboard header

**Files:**
- Create: `webapp/components/dashboard/notifications-bell.tsx`
- Modify: `webapp/components/dashboard/dashboard-shell.tsx` (mount the bell, pass initial data); the shell's server data source (the dashboard layout/server wrapper) to fetch `listNotifications` + `unreadCount`.

**Interfaces:**
- Consumes: `lib/notifications/client.ts`, server `listNotifications`/`unreadCount` (Task 10).
- The bell is a **client component** seeded with server data; it revalidates on `window` focus (cheap, not polling) and on dropdown open. Mark-read calls the API + updates local state; clicking an item navigates to `href` and marks read.

- [ ] **Step 1: Server-fetch initial data.** In the dashboard shell's server entry (the file that renders `<DashboardShell>` — follow the existing `getServerUserId()` pattern), fetch:

```typescript
import { getServerUserId } from "@/lib/auth/current-user"
import { listNotifications, unreadCount } from "@/lib/server/notifications"
// ...
const userId = getServerUserId()
const [initialNotifications, initialUnread] = await Promise.all([
  listNotifications(userId, { limit: 20 }),
  unreadCount(userId),
])
// pass these as props down to <DashboardShell> → <NotificationsBell>
```

- [ ] **Step 2: Build `notifications-bell.tsx`** — reuse `components/dashboard/job-detail/menu.tsx` (Portal + outside-click/Escape) for the dropdown, `Button` (`variant="ghost" size="icon"`), and the `Bell` lucide icon. Structure:
  - Bell button with an unread count badge (Fern dot/number) when `unread > 0`.
  - Dropdown: header ("Notifications" + "Mark all read"), scrollable list of items (title, body, relative time via `lib/dates.ts`, unread dot), empty state ("You're all caught up").
  - On mount + on `window` "focus": call `listNotifications()` to refresh (guard against overlapping fetches; this replaces polling).
  - Item click: if `href`, `router.push(href)`; call `markNotificationRead(id)`; optimistically clear the unread dot and decrement the badge.
  - "Mark all read": `markAllNotificationsRead()` + optimistic clear.

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Menu } from "@/components/dashboard/job-detail/menu" // adjust import to actual export
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/client"
import type { NotificationDto } from "@/lib/notifications/types"

export function NotificationsBell({
  initialItems,
  initialUnread,
}: {
  initialItems: NotificationDto[]
  initialUnread: number
}) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [unread, setUnread] = useState(initialUnread)

  async function refresh() {
    try {
      const next = await listNotifications()
      setItems(next)
      setUnread(next.filter((n) => !n.readAt).length)
    } catch {
      // network blip — keep current state
    }
  }

  useEffect(() => {
    const onFocus = () => void refresh()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  async function open(item: NotificationDto) {
    if (!item.readAt) {
      setItems((cur) => cur.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)))
      setUnread((u) => Math.max(0, u - 1))
      markNotificationRead(item.id).catch(() => void refresh())
    }
    if (item.href) router.push(item.href)
  }

  // Render: <Button> bell with badge → <Menu> dropdown listing `items`,
  // "Mark all read" calling markAllNotificationsRead() + setUnread(0),
  // empty state when items.length === 0. Match warm-paper/Fern tokens.
  // (Lay out using existing Card/Menu primitives; see reminders-feed.tsx for list styling.)
  return null // replace with the markup above per the spec
}
```

> Implementer note: the `return null` is a scaffold marker — build the markup described in the comment using the existing `Menu`, `Button`, `Card`, and date helpers. Mirror the row styling and empty-state pattern in [reminders-feed.tsx](../../../webapp/components/dashboard/reminders-feed.tsx).

- [ ] **Step 3: Mount the bell** in `dashboard-shell.tsx` header area (top bar, near the primary action). Pass `initialItems`/`initialUnread` props through from the server entry.

- [ ] **Step 4: Verify** — run dev server, load `/dashboard`. Bell renders, dropdown opens/closes, empty state shows. (Manual; no Playwright.)

- [ ] **Step 5: Commit**

```bash
git add webapp/components/dashboard/notifications-bell.tsx webapp/components/dashboard/dashboard-shell.tsx webapp/app/dashboard
git commit -m "feat: notifications bell in dashboard header"
```

---

# PHASE 4 — System-generated reminders

### Task 14: Interview reminder generation (Job.interviewAt → SYSTEM reminder)

**Files:**
- Modify: `webapp/lib/validations/job.ts` (accept `interviewAt`), `webapp/lib/server/jobs.ts` (trigger upsert), 
- Create: `webapp/lib/server/system-reminders.ts`
- Test: `webapp/lib/server/system-reminders.test.ts` (lead-time computation — pure)

**Interfaces:**
- Produces:
  - `interviewReminderFireAt(interviewAt: Date, leadHours?: number): Date` — pure.
  - `upsertInterviewReminder(userId, jobId, interviewAt: Date | null): Promise<void>` — creates/updates/removes the single `(jobId, systemKey="interview")` SYSTEM reminder; schedules/cancels its QStash delivery.
- Consumes: scheduler (Task 5).

- [ ] **Step 1: Failing test for lead-time:**

```typescript
import { describe, expect, it } from "vitest"
import { interviewReminderFireAt } from "./system-reminders"

describe("interviewReminderFireAt", () => {
  it("defaults to 24h before", () => {
    const at = new Date("2030-06-10T15:00:00.000Z")
    const fire = interviewReminderFireAt(at)
    expect(fire.toISOString()).toBe("2030-06-09T15:00:00.000Z")
  })
})
```

- [ ] **Step 2: Run — expect FAIL**, then implement `system-reminders.ts` (lead-time + upsert):

```typescript
import { prisma } from "@/lib/db"
import { cancelScheduledDelivery, scheduleReminderDelivery } from "@/lib/reminders/scheduler"

const INTERVIEW_KEY = "interview"
const DEFAULT_LEAD_HOURS = 24

export function interviewReminderFireAt(interviewAt: Date, leadHours = DEFAULT_LEAD_HOURS): Date {
  return new Date(interviewAt.getTime() - leadHours * 60 * 60 * 1000)
}

/**
 * Keep exactly one SYSTEM interview reminder per job in sync with Job.interviewAt.
 * - interviewAt set    → upsert reminder (fire = interviewAt - lead), (re)schedule QStash.
 * - interviewAt cleared → delete reminder + cancel its QStash message.
 * Idempotent via the (jobId, systemKey) unique constraint.
 */
export async function upsertInterviewReminder(
  userId: string,
  jobId: string,
  interviewAt: Date | null,
): Promise<void> {
  const existing = await prisma.reminder.findUnique({
    where: { jobId_systemKey: { jobId, systemKey: INTERVIEW_KEY } },
    select: { id: true, qstashMessageId: true },
  })

  if (!interviewAt) {
    if (existing) {
      await cancelScheduledDelivery(existing.qstashMessageId)
      await prisma.reminder.delete({ where: { id: existing.id } })
    }
    return
  }

  const job = await prisma.job.findFirst({ where: { id: jobId, userId }, select: { company: true } })
  if (!job) return
  const fireAt = interviewReminderFireAt(interviewAt)
  const title = `Interview with ${job.company}`

  // cancel any prior schedule, then (re)create the row and schedule fresh
  if (existing) await cancelScheduledDelivery(existing.qstashMessageId)

  const row = await prisma.reminder.upsert({
    where: { jobId_systemKey: { jobId, systemKey: INTERVIEW_KEY } },
    create: {
      user: { connect: { id: userId } },
      job: { connect: { id: jobId } },
      title,
      type: "SYSTEM",
      systemKey: INTERVIEW_KEY,
      dueAt: fireAt,
      hasTime: true,
      deliveredAt: null,
    },
    update: { title, dueAt: fireAt, deliveredAt: null, done: false },
    select: { id: true },
  })

  const messageId = await scheduleReminderDelivery(row.id, fireAt)
  await prisma.reminder.update({ where: { id: row.id }, data: { qstashMessageId: messageId } })
}
```

> Note: `jobId_systemKey` is Prisma's compound-unique accessor generated from `@@unique([jobId, systemKey])`. Verify the exact name after `db:generate` (Prisma names it from the field order).

- [ ] **Step 3: Run — expect PASS.**

- [ ] **Step 4: Accept `interviewAt` in the job update schema** — in `lib/validations/job.ts`, add to `updateJobSchema`:

```typescript
  interviewAt: z.coerce.date().nullable().optional(),
```

- [ ] **Step 5: Trigger from `updateJob`** — in `lib/server/jobs.ts`, after the job row is updated, if `input.interviewAt !== undefined` call the upsert:

```typescript
import { upsertInterviewReminder } from "@/lib/server/system-reminders"
// ... inside updateJob, after the prisma.job.update(...) that yields the updated row:
  if (input.interviewAt !== undefined) {
    await upsertInterviewReminder(userId, id, input.interviewAt ?? null)
  }
```

- [ ] **Step 6: Typecheck + test**

Run: `cd webapp && npm run typecheck && npm run test`

- [ ] **Step 7: Commit**

```bash
git add webapp/lib/server/system-reminders.ts webapp/lib/server/system-reminders.test.ts webapp/lib/validations/job.ts webapp/lib/server/jobs.ts
git commit -m "feat: interview reminders from Job.interviewAt"
```

---

### Task 15: Interview date UI on the job page

**Files:** Modify: `webapp/components/dashboard/job-detail/tracking-rail.tsx` (or the status menu) — add an "Interview date" control.

**Interfaces:** Consumes existing `updateJob` client path (`PATCH /api/jobs/:id` with `{ interviewAt }`).

- [ ] **Step 1: Add an "Interview" row** to the tracking rail card: a native `<input type="datetime-local">` (matches the codebase's native date/time approach). On change, PATCH the job with `{ interviewAt: <ISO> }` (or `null` when cleared), then `router.refresh()`. Show a small "We'll remind you 24h before" helper line when set.
- [ ] **Step 2: Surface only when sensible** — show the interview field always, or gate behind `status === "INTERVIEWING"`; default: always visible in the rail under tracking. (Confirm preference.)
- [ ] **Step 3: Verify** — set a date, confirm a SYSTEM reminder appears in the per-job reminders card and `/dashboard/reminders` (type "Auto"). Clear it, confirm the reminder disappears.
- [ ] **Step 4: Commit**

```bash
git add webapp/components/dashboard/job-detail/tracking-rail.tsx
git commit -m "feat: interview date control on job page"
```

---

### Task 16: Notification preferences service (full) + ensure-on-read

**Files:**
- Modify: `webapp/lib/server/notification-preferences.ts` (extend Task 7's minimal file)
- Test: `webapp/lib/server/notification-preferences.test.ts` (digest user-selection by local hour — pure)
- Create: `webapp/lib/validations/notification-preferences.ts`

**Interfaces:**
- Produces:
  - `getOrCreatePreferences(userId): Promise<NotificationPreference>` (lazily creates defaults).
  - `updatePreferences(userId, input): Promise<NotificationPreference>`.
  - `isDigestDueNow(prefs, now: Date): boolean` — pure: true when `digestEnabled`, frequency window elapsed since `lastDigestAt`, and the user's **local** hour equals `digestHour`.
  - `localHourInTz(now: Date, timezone: string): number` — pure helper.
- Consumes: `resolveChannels` already here.

- [ ] **Step 1: Failing test for `isDigestDueNow` across timezones:**

```typescript
import { describe, expect, it } from "vitest"
import { isDigestDueNow, localHourInTz } from "./notification-preferences"

const base = {
  digestEnabled: true, digestFrequency: "DAILY", digestHour: 8,
  timezone: "America/New_York", lastDigestAt: null,
} as never

describe("localHourInTz", () => {
  it("converts UTC to a zone hour", () => {
    // 2030-01-01T13:00Z is 08:00 in New York (EST, UTC-5)
    expect(localHourInTz(new Date("2030-01-01T13:00:00Z"), "America/New_York")).toBe(8)
  })
})

describe("isDigestDueNow", () => {
  it("fires at the local digest hour when never sent", () => {
    expect(isDigestDueNow(base, new Date("2030-01-01T13:00:00Z"))).toBe(true)
  })
  it("does not fire at the wrong hour", () => {
    expect(isDigestDueNow(base, new Date("2030-01-01T18:00:00Z"))).toBe(false)
  })
  it("does not re-fire within the same day", () => {
    const prefs = { ...base, lastDigestAt: new Date("2030-01-01T13:00:00Z") } as never
    expect(isDigestDueNow(prefs, new Date("2030-01-01T13:30:00Z"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**, then implement (append to `notification-preferences.ts`):

```typescript
import type { NotificationPreference } from "@prisma/client"

import { prisma } from "@/lib/db"
import type { UpdatePreferencesInput } from "@/lib/validations/notification-preferences"

export function localHourInTz(now: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone })
  return Number(fmt.format(now))
}

export function isDigestDueNow(
  prefs: Pick<NotificationPreference, "digestEnabled" | "digestFrequency" | "digestHour" | "timezone" | "lastDigestAt">,
  now: Date,
): boolean {
  if (!prefs.digestEnabled || prefs.digestFrequency === "OFF") return false
  if (localHourInTz(now, prefs.timezone) !== prefs.digestHour) return false
  if (!prefs.lastDigestAt) return true
  const elapsedH = (now.getTime() - prefs.lastDigestAt.getTime()) / 3_600_000
  const minGapH = prefs.digestFrequency === "WEEKLY" ? 24 * 6.5 : 23 // guard against double-send in the same hour window
  return elapsedH >= minGapH
}

export async function getOrCreatePreferences(userId: string): Promise<NotificationPreference> {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } })
  if (existing) return existing
  return prisma.notificationPreference.create({ data: { userId } })
}

export async function updatePreferences(
  userId: string,
  input: UpdatePreferencesInput,
): Promise<NotificationPreference> {
  await getOrCreatePreferences(userId)
  return prisma.notificationPreference.update({ where: { userId }, data: input })
}
```

- [ ] **Step 3: Zod schema** `lib/validations/notification-preferences.ts`:

```typescript
import { z } from "zod"

export const updatePreferencesSchema = z
  .object({
    timezone: z.string().min(1).optional(),
    emailEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
    extensionEnabled: z.boolean().optional(),
    digestEnabled: z.boolean().optional(),
    digestFrequency: z.enum(["DAILY", "WEEKLY", "OFF"]).optional(),
    digestHour: z.number().int().min(0).max(23).optional(),
    staleAfterDays: z.number().int().min(1).max(90).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field" })

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>
```

- [ ] **Step 4: Run — expect PASS**, typecheck, commit:

```bash
git add webapp/lib/server/notification-preferences.ts webapp/lib/server/notification-preferences.test.ts webapp/lib/validations/notification-preferences.ts
git commit -m "feat: notification preferences service + digest scheduling logic"
```

---

### Task 17: Digest run logic + cron route

**Files:**
- Modify: `webapp/lib/server/system-reminders.ts` (add `runDigest`, `selectStaleJobs`)
- Create: `webapp/app/api/cron/reminders-digest/route.ts`
- Test: extend `system-reminders.test.ts` (selection cutoff — pure helper)

**Interfaces:**
- Produces:
  - `staleCutoff(now: Date, staleAfterDays: number): Date` — pure.
  - `runDigest(now: Date): Promise<{ usersNotified: number }>` — iterates users with prefs, fires digest where `isDigestDueNow`, sets `lastDigestAt`.
- Consumes: `isDigestDueNow`, `getOrCreatePreferences`, `createNotification`, `sendEmail`, `digestEmail`, `digestCopy`.

- [ ] **Step 1: Failing test for `staleCutoff`:**

```typescript
import { describe, expect, it } from "vitest"
import { staleCutoff } from "./system-reminders"

describe("staleCutoff", () => {
  it("subtracts whole days", () => {
    expect(staleCutoff(new Date("2030-01-10T00:00:00Z"), 3).toISOString()).toBe("2030-01-07T00:00:00.000Z")
  })
})
```

- [ ] **Step 2: Run — expect FAIL**, then implement (append to `system-reminders.ts`):

```typescript
import { createNotification } from "@/lib/server/notifications"
import { getOrCreatePreferences, isDigestDueNow } from "@/lib/server/notification-preferences"
import { sendEmail } from "@/lib/email/client"
import { digestEmail } from "@/lib/email/templates"
import { digestCopy } from "@/lib/reminders/copy"

export function staleCutoff(now: Date, staleAfterDays: number): Date {
  return new Date(now.getTime() - staleAfterDays * 24 * 60 * 60 * 1000)
}

async function selectStaleJobs(userId: string, cutoff: Date) {
  return prisma.job.findMany({
    where: { userId, status: "SAVED", updatedAt: { lt: cutoff } },
    orderBy: { updatedAt: "asc" },
    select: { id: true, title: true, company: true },
    take: 50,
  })
}

/**
 * Hourly digest sweep. For each user whose local digest hour is now and whose
 * frequency window has elapsed, gather stale SAVED jobs and (if any) send one
 * in-app + one email digest, then stamp lastDigestAt. Per-user failures are
 * isolated so one bad send doesn't abort the sweep.
 */
export async function runDigest(now: Date): Promise<{ usersNotified: number }> {
  const prefs = await prisma.notificationPreference.findMany({ where: { digestEnabled: true } })
  let usersNotified = 0
  for (const p of prefs) {
    try {
      if (!isDigestDueNow(p, now)) continue
      const jobs = await selectStaleJobs(p.userId, staleCutoff(now, p.staleAfterDays))
      if (jobs.length > 0) {
        const copy = digestCopy({ count: jobs.length, sample: jobs.slice(0, 5) })
        const channels = resolveChannels(p)
        if (channels.inApp) {
          await createNotification(p.userId, { kind: "DIGEST", title: copy.title, body: copy.body, href: "/dashboard/saved" })
        }
        if (channels.email) {
          const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { email: true } })
          if (user) await sendEmail({ to: user.email, subject: copy.title, html: digestEmail(copy, "/dashboard/saved") })
        }
        usersNotified++
      }
      await prisma.notificationPreference.update({ where: { userId: p.userId }, data: { lastDigestAt: now } })
    } catch (err) {
      console.error("[digest] user failed", p.userId, err)
    }
  }
  return { usersNotified }
}
```

> Add `import { resolveChannels } from "@/lib/server/notification-preferences"` at the top of `system-reminders.ts` (it already imports prisma + scheduler).

- [ ] **Step 3: Run — expect PASS.**

- [ ] **Step 4: Cron route** `app/api/cron/reminders-digest/route.ts` (QStash-signed; runs the sweep at the *current* time):

```typescript
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs"

import { runDigest } from "@/lib/server/system-reminders"

async function handler() {
  const res = await runDigest(new Date())
  return Response.json({ ok: true, ...res })
}

export const POST = verifySignatureAppRouter(handler)
```

- [ ] **Step 5: Typecheck**, then commit:

```bash
git add webapp/lib/server/system-reminders.ts webapp/lib/server/system-reminders.test.ts webapp/app/api/cron/reminders-digest
git commit -m "feat: digest sweep + hourly cron route"
```

---

### Task 18: QStash schedule setup script

**Files:**
- Create: `webapp/scripts/setup-qstash-schedules.ts`
- Modify: `webapp/package.json` (script `qstash:setup`)

**Interfaces:** One-time idempotent registration of the hourly digest cron.

- [ ] **Step 1: Write the script**

```typescript
import { Client } from "@upstash/qstash"

import { env } from "@/lib/env"

async function main() {
  if (!env.QSTASH_TOKEN) throw new Error("QSTASH_TOKEN is required")
  const client = new Client({ token: env.QSTASH_TOKEN })
  const destination = `${env.APP_URL}/api/cron/reminders-digest`
  const res = await client.schedules.create({ destination, cron: "0 * * * *" }) // top of every hour
  console.log("Created digest schedule:", res.scheduleId, "→", destination)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Add script** to `package.json`:

```json
"qstash:setup": "tsx scripts/setup-qstash-schedules.ts"
```

- [ ] **Step 3: Document run** in `scripts/curl/README.md` (created in Task 21): "run `npm run qstash:setup` once per environment after `APP_URL` is publicly reachable. To re-point it, delete the old schedule in the Upstash console first." 

- [ ] **Step 4: Commit**

```bash
git add webapp/scripts/setup-qstash-schedules.ts webapp/package.json
git commit -m "feat: qstash digest schedule setup script"
```

---

### Task 19: Notification preferences API

**Files:** Create: `webapp/app/api/notification-preferences/route.ts`

- [ ] **Step 1: Route (GET + PATCH)**

```typescript
import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { getOrCreatePreferences, updatePreferences } from "@/lib/server/notification-preferences"
import { updatePreferencesSchema } from "@/lib/validations/notification-preferences"

export const GET = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  return ok(await getOrCreatePreferences(userId))
})

export const PATCH = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  const input = updatePreferencesSchema.parse(await req.json())
  return ok(await updatePreferences(userId, input))
})

export const OPTIONS = preflight
```

- [ ] **Step 2: Verify with curl**

```bash
curl -s localhost:3100/api/notification-preferences | head
```
Expected: `{"data":{...defaults...}}`.

- [ ] **Step 3: Commit**

```bash
git add webapp/app/api/notification-preferences
git commit -m "feat: notification preferences api"
```

---

# PHASE 5 — Extension: reminder-add UX

### Task 20: Extension reminder message handlers

**Files:** Modify: `extension/background.js`

**Interfaces:** New message types handled in the service worker, each calling the existing API via `apiFetch`:
- `LIST_JOB_REMINDERS { jobId }` → `GET /api/jobs/:id/reminders` → `{ ok, reminders }`
- `CREATE_REMINDER { jobId, fields }` → `POST /api/jobs/:id/reminders` → `{ ok, reminder }`
- `TOGGLE_REMINDER { id, done }` → `PATCH /api/reminders/:id` → `{ ok, reminder }`
- `DELETE_REMINDER { id }` → `DELETE /api/reminders/:id` → `{ ok }`

- [ ] **Step 1: Add handler functions** near `saveJob`/`getJobs` in `background.js`:

```javascript
async function listJobReminders(jobId) {
  return apiFetch(`/api/jobs/${jobId}/reminders`, { method: "GET" });
}
async function createReminder(jobId, fields) {
  return apiFetch(`/api/jobs/${jobId}/reminders`, { method: "POST", body: JSON.stringify(fields) });
}
async function toggleReminder(id, done) {
  return apiFetch(`/api/reminders/${id}`, { method: "PATCH", body: JSON.stringify({ done }) });
}
async function deleteReminderApi(id) {
  return apiFetch(`/api/reminders/${id}`, { method: "DELETE" });
}
```

- [ ] **Step 2: Add to the `onMessage` switch** (follow the existing `return true` async pattern):

```javascript
  if (msg?.type === "LIST_JOB_REMINDERS") {
    listJobReminders(msg.jobId)
      .then((reminders) => sendResponse({ ok: true, reminders }))
      .catch((err) => sendResponse({ ok: false, error: String(err), reminders: [] }));
    return true;
  }
  if (msg?.type === "CREATE_REMINDER") {
    createReminder(msg.jobId, msg.fields)
      .then((reminder) => sendResponse({ ok: true, reminder }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "TOGGLE_REMINDER") {
    toggleReminder(msg.id, msg.done)
      .then((reminder) => sendResponse({ ok: true, reminder }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "DELETE_REMINDER") {
    deleteReminderApi(msg.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
```

- [ ] **Step 3: Reload the extension** (chrome://extensions → reload). No errors in the service worker console.

- [ ] **Step 4: Commit**

```bash
git add extension/background.js
git commit -m "feat(ext): reminder CRUD message handlers"
```

---

### Task 21: `GET /api/reminders` list endpoint (extension sync) + curl scripts

**Files:**
- Modify: `webapp/app/api/reminders/route.ts` (add `GET`)
- Create: `webapp/scripts/curl/README.md`, `webapp/scripts/curl/reminders.sh`

**Interfaces:** `GET /api/reminders?upcoming=1&days=30` → `{ data: Reminder[] }`. Without params, full list (matches `listReminders`). With `upcoming`, only not-done reminders with `dueAt` between now and now+days (used by the extension alarm sync, Task 23).

- [ ] **Step 1: Add a service function** `listUpcomingReminders(userId, days)` to `lib/server/reminders.ts`:

```typescript
export async function listUpcomingReminders(userId: string, days: number): Promise<Reminder[]> {
  const now = new Date()
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  const rows = await prisma.reminder.findMany({
    where: { userId, done: false, dueAt: { gte: now, lte: until } },
    orderBy: { dueAt: "asc" },
    include: { job: { select: jobSelect } },
  })
  return rows.map(toClientReminder)
}
```

- [ ] **Step 2: Add `GET`** to `app/api/reminders/route.ts`:

```typescript
export const GET = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  const url = new URL(req.url)
  if (url.searchParams.get("upcoming")) {
    const days = Number(url.searchParams.get("days") ?? "30")
    return ok(await listUpcomingReminders(userId, Number.isFinite(days) ? days : 30))
  }
  return ok(await listReminders(userId))
})
```

(Add the imports for `listReminders`, `listUpcomingReminders`.)

- [ ] **Step 3: Curl scripts** `scripts/curl/reminders.sh` (list, create-due-soon, fire-manually-without-signature note). Include a README explaining the **local QStash dev server** flow:

```
# Local QStash development (so callbacks reach localhost):
#   npx @upstash/qstash-cli dev
# It prints QSTASH_URL + QSTASH_TOKEN + signing keys. Put them in .env.local,
# set QSTASH_URL via the SDK base (or use the printed token), restart `npm run dev`.
# Then created reminders schedule against your local app and fire on time.
```

- [ ] **Step 4: Verify** `curl -s "localhost:3100/api/reminders?upcoming=1&days=30"` → `{"data":[...]}`.

- [ ] **Step 5: Commit**

```bash
git add webapp/app/api/reminders/route.ts webapp/lib/server/reminders.ts webapp/scripts/curl
git commit -m "feat: GET /api/reminders (upcoming) + curl/dev docs"
```

---

### Task 22: Reminders section in the extension save panel

**Files:**
- Create: `extension/ui/reminders.js`
- Modify: `extension/ui/modal.js` (mount the section in the Details tab), `extension/manifest.json` (add `ui/reminders.js` to the content_scripts `js` array, before `content.js`), `extension/content.js` (extend the per-posting record with `reminders`; expose a save hook).

**Interfaces:**
- `Reminders.render(container, { jobId, host })` — renders the list + add form; reads/writes via `chrome.runtime.sendMessage`.
- Per-posting local record gains `reminders: Reminder[]` (cached; refreshed on panel open).

- [ ] **Step 1: Build `ui/reminders.js`** — a shadow-DOM-friendly module mirroring the web `reminder-popover` UX but in vanilla JS + the extension's token styles (neutral white + Fern). Sections:
  - **Empty/gating:** if no `jobId` (job not saved yet), show "Save this job to add reminders." 
  - **List:** each reminder = circular checkbox (toggle done → `TOGGLE_REMINDER`) + title + due label + delete (`DELETE_REMINDER`). Open before done.
  - **Add form:** text input ("Remind me to…") + quick chips (Tomorrow 9am / In 3 days / Next week) + native `date`/`time` inputs → builds `{ title, dueAt (ISO), hasTime }` → `CREATE_REMINDER`.
  - On any mutation, update the local cached `reminders` and re-render; call the alarm-sync hook (Task 23).

```javascript
// extension/ui/reminders.js  (attaches to window for content-script use; no modules)
(function () {
  function send(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  }
  function dueLabel(r) {
    if (!r.dueAt) return "";
    const d = new Date(r.dueAt);
    return r.hasTime ? d.toLocaleString() : d.toLocaleDateString();
  }
  async function load(jobId) {
    const res = await send({ type: "LIST_JOB_REMINDERS", jobId });
    return res && res.ok ? res.reminders : [];
  }
  async function render(container, ctx) {
    container.innerHTML = "";
    if (!ctx.jobId) {
      container.appendChild(el("div", "jt-rem-empty", "Save this job to add reminders."));
      return;
    }
    const list = await load(ctx.jobId);
    // ... build list rows (toggle/delete) + the add form per the spec above,
    // styling with the extension's --primary (#3f9b6a) tokens. After a successful
    // CREATE/TOGGLE/DELETE, call window.JTReminderAlarms?.syncFromReminders(...) (Task 23)
    // and re-render.
  }
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  window.JTReminders = { render };
})();
```

> Implementer note: flesh out the list rows + add form following [reminder-popover.tsx](../../../webapp/components/dashboard/job-detail/reminder-popover.tsx) for behavior (chips, validation, Enter-to-save, disabled-while-saving) and `extension/ui/modal.js` for styling idioms.

- [ ] **Step 2: Mount in `modal.js`** — in the Details tab render path, after the notes section, add a "Reminders" block and call `window.JTReminders.render(node, { jobId: savedJobId, host })`. `savedJobId` comes from the local "saved" marker (reminders require a saved job; if unsaved, the gating message shows).

- [ ] **Step 3: Register the script** in `manifest.json` content_scripts `js` array (order: after `ui/application.js`, before `content.js`).

- [ ] **Step 4: Verify** — on a saved posting, open the panel → Details → add a reminder; confirm it appears in the web `/dashboard/jobs/:id` reminders card after refresh (shared backend).

- [ ] **Step 5: Commit**

```bash
git add extension/ui/reminders.js extension/ui/modal.js extension/manifest.json extension/content.js
git commit -m "feat(ext): reminders section in save panel"
```

---

# PHASE 6 — Extension: local delivery (alarms + notifications)

### Task 23: Alarm reconciliation + OS notifications

**Files:**
- Create: `extension/lib/reminder-alarms.js`
- Modify: `extension/manifest.json` (permissions `alarms`, `notifications`; add the script to content_scripts AND ensure it's importable by the service worker), `extension/background.js` (`importScripts` or inline; register `onAlarm` + `notifications.onClicked` + a daily `jt:sync` alarm).

**Interfaces:**
- `syncReminderAlarms()` — fetch `GET /api/reminders?upcoming=1&days=30`, clear stale `reminder:*` alarms, create one alarm per upcoming reminder at `dueAt`.
- `onAlarm(alarm)` — when `alarm.name` starts with `reminder:`, look up the cached reminder and `chrome.notifications.create`.
- Respect locally-cached `extensionEnabled` pref.

- [ ] **Step 1: Add permissions** to `manifest.json`:

```json
"permissions": ["storage", "activeTab", "alarms", "notifications"],
```

- [ ] **Step 2: Implement `extension/lib/reminder-alarms.js`** (service-worker context; plain functions on `self`):

```javascript
// Runs in the background service worker. Keeps chrome.alarms in sync with the
// user's upcoming reminders and fires an OS notification when one is due.
const REM_PREFIX = "reminder:";
const SYNC_ALARM = "jt:sync";

async function fetchUpcoming() {
  // apiFetch is defined in background.js (same SW scope)
  try {
    return await apiFetch("/api/reminders?upcoming=1&days=30", { method: "GET" });
  } catch (_) {
    return [];
  }
}

async function syncReminderAlarms() {
  const prefs = await getCachedPrefs(); // {extensionEnabled} cached in storage; default true
  const existing = await chrome.alarms.getAll();
  for (const a of existing) {
    if (a.name.startsWith(REM_PREFIX)) await chrome.alarms.clear(a.name);
  }
  if (prefs && prefs.extensionEnabled === false) return;

  const reminders = await fetchUpcoming();
  const map = {};
  for (const r of reminders) {
    if (!r.dueAt) continue;
    const when = new Date(r.dueAt).getTime();
    if (when <= Date.now()) continue;
    map[r.id] = { id: r.id, title: r.title, dueAt: r.dueAt, job: r.job || null };
    await chrome.alarms.create(REM_PREFIX + r.id, { when });
  }
  await chrome.storage.local.set({ "jt:reminderCache": map });
}

async function getCachedPrefs() {
  const o = await chrome.storage.local.get("jt:notifPrefs");
  return o["jt:notifPrefs"] || { extensionEnabled: true };
}

async function handleReminderAlarm(name) {
  const id = name.slice(REM_PREFIX.length);
  const o = await chrome.storage.local.get("jt:reminderCache");
  const cache = o["jt:reminderCache"] || {};
  const r = cache[id];
  if (!r) return;
  const company = r.job && r.job.company ? r.job.company + ": " : "";
  chrome.notifications.create("jtrem:" + id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "JobTracker reminder",
    message: company + r.title,
    priority: 1,
  });
  // store the deep link for click handling
  const links = (await chrome.storage.local.get("jt:notifLinks"))["jt:notifLinks"] || {};
  links["jtrem:" + id] = r.job ? `${API_BASE}/dashboard/jobs/${r.job.id}` : `${API_BASE}/dashboard/reminders`;
  await chrome.storage.local.set({ "jt:notifLinks": links });
}

self.syncReminderAlarms = syncReminderAlarms;
self.handleReminderAlarm = handleReminderAlarm;
self.REM_PREFIX = REM_PREFIX;
self.SYNC_ALARM = SYNC_ALARM;
```

- [ ] **Step 3: Load + wire in `background.js`** — at the top (after `API_BASE` and `apiFetch` are defined, since the module references them), add `importScripts("lib/reminder-alarms.js")`, then register listeners and the daily sync:

```javascript
// daily background sync of alarms (deliberate, once a day — not browse-time polling)
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(self.SYNC_ALARM, { periodInMinutes: 1440 });
  syncReminderAlarms().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => { syncReminderAlarms().catch(() => {}); });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === self.SYNC_ALARM) { syncReminderAlarms().catch(() => {}); return; }
  if (alarm.name.startsWith(self.REM_PREFIX)) { handleReminderAlarm(alarm.name).catch(() => {}); }
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  const links = (await chrome.storage.local.get("jt:notifLinks"))["jt:notifLinks"] || {};
  const url = links[notifId];
  if (url) chrome.tabs.create({ url });
  chrome.notifications.clear(notifId);
});
```

> `importScripts` requires `lib/reminder-alarms.js` to be resolvable from the SW. Since the SW is `background.js` at the extension root, use `importScripts("lib/reminder-alarms.js")`. (The same file is NOT added to content_scripts — it's SW-only.)

- [ ] **Step 4: Trigger sync after extension reminder mutations** — in `content.js` (or via a message), after a successful `CREATE_REMINDER`/`TOGGLE_REMINDER`/`DELETE_REMINDER`, send a `SYNC_REMINDER_ALARMS` message; add a handler in `background.js` that calls `syncReminderAlarms()`. This keeps OS alarms fresh without waiting for the daily sync.

- [ ] **Step 5: Verify** — create a reminder due in ~2 minutes from the extension; lock/leave the tab; confirm an OS notification fires and clicking opens the job page. Confirm toggling a reminder done before it fires cancels the OS notification (next sync clears the alarm).

- [ ] **Step 6: Commit**

```bash
git add extension/lib/reminder-alarms.js extension/background.js extension/content.js extension/manifest.json
git commit -m "feat(ext): local reminder delivery via alarms + notifications"
```

---

# PHASE 7 — Settings UI

### Task 24: Notification settings panel

**Files:**
- Create: `webapp/components/dashboard/settings/notification-settings.tsx`
- Modify: `webapp/app/dashboard/settings/page.tsx` (mount it; server-fetch `getOrCreatePreferences`)
- Optional: extend `lib/notifications/client.ts` with `getPreferences()/updatePreferences()`.

**Interfaces:** Consumes `GET/PATCH /api/notification-preferences`.

- [ ] **Step 1: Client helpers** — add to a `lib/notifications/client.ts` (or a new `lib/preferences/client.ts`): `updatePreferences(patch)` → `PATCH /api/notification-preferences`.

- [ ] **Step 2: Build the form** (client component) seeded with server prefs:
  - **Channels:** toggles for In-app, Email, Extension (`inAppEnabled`/`emailEnabled`/`extensionEnabled`).
  - **Digest:** enable toggle, frequency (Daily/Weekly/Off), hour (0–23 select), "stale after" days (number).
  - **Timezone:** auto-detect default via `Intl.DateTimeFormat().resolvedOptions().timeZone`; editable select. On first load, if prefs.timezone is "UTC" and detected differs, PATCH the detected tz silently.
  - Each change PATCHes immediately (debounced) and reflects saved state inline ("Saved" / error). Reuse `Button`, `Input`, existing toggle/switch primitive (or build a small switch with tokens).

- [ ] **Step 3: Mount** under `/dashboard/settings` with a "Notifications" heading.

- [ ] **Step 4: Verify** — toggle email off; fire a reminder (or run the digest cron manually); confirm no email but in-app still appears. Re-enable.

- [ ] **Step 5: Commit**

```bash
git add webapp/components/dashboard/settings/notification-settings.tsx webapp/app/dashboard/settings webapp/lib/notifications/client.ts
git commit -m "feat: notification settings panel"
```

---

# PHASE 8 — End-to-end verification & docs

### Task 25: E2E verification (manual, no Playwright) + doc updates

**Files:** Create/update `webapp/docs/REMINDERS.md`; update project `MEMORY.md` pointer.

- [ ] **Step 1: Run the full logic suite**

Run: `cd webapp && npm run test && npm run typecheck`
Expected: all green.

- [ ] **Step 2: Local QStash E2E** — start `npx @upstash/qstash-cli dev`, wire its token/keys into `.env.local`, `npm run dev`, then:
  - Create a reminder due in ~1 min (web) → confirm in-app notification appears in the bell and (if Resend configured) email arrives.
  - Set a `Job.interviewAt` → confirm a SYSTEM reminder is created and scheduled.
  - Run `curl` to POST the digest cron (signed via the dev server) or temporarily call `runDigest(new Date())` from a script → confirm digest notification for a stale SAVED job.
  - From the extension, add a reminder due in ~2 min → confirm the OS notification fires.

- [ ] **Step 3: Idempotency check** — manually POST the same `{reminderId}` to `/api/reminders/fire` twice (via the dev server so it's signed); confirm only one notification/email is produced (the claim guard).

- [ ] **Step 4: Write `webapp/docs/REMINDERS.md`** — architecture diagram (QStash → worker → channels; extension alarms), the data model additions, the env vars, the local-dev QStash flow, the digest cadence logic, and the known v1 limitation (extension OS-notify lag until next sync). Per the project's "always update MD docs after big work" rule, also note the new endpoints in `BACKEND.md`.

- [ ] **Step 5: Commit**

```bash
git add webapp/docs/REMINDERS.md webapp/docs/BACKEND.md
git commit -m "docs: reminders delivery architecture + endpoints"
```

---

## Production Setup Checklist (post-merge, ops)

- [ ] Set prod env: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` (verified domain), `APP_URL` (public origin).
- [ ] Run `npm run qstash:setup` once to register the hourly digest cron pointing at the deployed `APP_URL`.
- [ ] Verify the worker route is publicly reachable and signature verification passes (send a test from the Upstash console).
- [ ] Confirm Neon connection pooling handles the hourly digest sweep (the sweep is one indexed query over `notification_preferences` + per-eligible-user job query).

---

## Self-Review

**1. Spec coverage (user's functional scope):**
- User reminder fires on web/email/extension at exact date+time → Tasks 5–13 (web+email), 23 (extension). ✓
- Periodic "you have stuff to do" digest for untouched/incomplete saved jobs → Tasks 16–18 (digest cadence + selection). ✓ (Incomplete-application detection deferred — Decision 8.)
- Interview reminder by date → Tasks 14–15. ✓
- User-set todo reminders → existing CRUD + scheduling (Tasks 5–6). ✓
- Extension reminder-add UX → Task 22. ✓
- Efficient CRUD, no needless reads → in-app via fetch-on-load + focus (no polling, Task 13); extension daily sync, not browse-time reads (Task 23); atomic claim avoids extra reads (Task 7). ✓
- Scheduler choice + no Celery → QStash + signed HTTP worker (Tasks 5, 7). ✓
- No visual tests → testing strategy excludes Playwright/DevTools (Decision 10, Task 25). ✓
- Skills/subagents called out → Skills & Subagents section. ✓

**2. Placeholder scan:** Two intentional scaffold markers (`return null` in the bell, the comment-driven body in `ui/reminders.js`) are explicitly flagged with "implementer note" pointers to the exact existing files to mirror — these are UI tasks that follow established, already-shown patterns, not hidden TODOs. All backend logic, schema, routes, scheduler, worker, delivery, channels, and system-generation code is complete.

**3. Type consistency:** `Reminder` client type unchanged (existing). New `NotificationDto`, `ResolvedChannels`, `ReminderDispatchContext`, `UpdatePreferencesInput` are defined once and consumed consistently. `fireReminder`, `scheduleReminderDelivery`, `cancelScheduledDelivery`, `upsertInterviewReminder`, `runDigest`, `isDigestDueNow` signatures match between definition and call sites. Prisma compound-unique accessor `jobId_systemKey` flagged for post-generate verification (Task 14 note).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-reminders-delivery.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Extension phases (5–6) can run in parallel with server phases in a separate worktree.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
