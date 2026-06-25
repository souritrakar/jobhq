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
      id: true,
      title: true,
      jobId: true,
      type: true,
      userId: true,
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
