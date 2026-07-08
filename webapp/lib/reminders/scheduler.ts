import { Client } from "@upstash/qstash"

import { env } from "@/lib/env"

// One module-level client. Null when QSTASH_TOKEN is unset (local dev without a
// tunnel / CI) — every function then no-ops so reminder CRUD still works.
const client = env.QSTASH_TOKEN ? new Client({ token: env.QSTASH_TOKEN }) : null

export function schedulerEnabled(): boolean {
  return client !== null
}

// QStash is a cloud service: it delivers by making an HTTP callback to APP_URL/api/reminders/fire.
// A localhost APP_URL is unreachable from the internet, so those callbacks silently never arrive —
// the reminder row is saved and looks scheduled, but no email/in-app heads-up ever fires. (The
// digest path doesn't hit QStash, which is why digests still land.) Warn loudly the first time so
// this isn't a mystery: point a public tunnel at :3100 and set APP_URL to it for local delivery.
let warnedLocalhost = false
function warnIfUnreachable(): void {
  if (warnedLocalhost) return
  const host = (() => {
    try {
      return new URL(env.APP_URL).hostname
    } catch {
      return ""
    }
  })()
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    warnedLocalhost = true
    console.warn(
      `[scheduler] APP_URL is ${env.APP_URL} — QStash can't call back to a local address, so ` +
        `scheduled reminders won't deliver. Expose :3100 via a public tunnel and set APP_URL to it.`,
    )
  }
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
  warnIfUnreachable()
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
