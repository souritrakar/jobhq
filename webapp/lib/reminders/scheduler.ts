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
