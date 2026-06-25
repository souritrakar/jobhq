import type { Reminder, User } from "@prisma/client"

import { sendEmail } from "@/lib/email/client"
import { reminderEmail } from "@/lib/email/templates"
import { reminderNotificationCopy } from "@/lib/reminders/copy"
import { createNotification } from "@/lib/server/notifications"

export type ReminderDispatchContext = {
  reminder: Pick<Reminder, "id" | "title" | "jobId" | "type">
  user: Pick<User, "id" | "email">
  // resolved channel switches + deep link, filled by the delivery module
  channels: { inApp: boolean; email: boolean }
  href: string | null
}

// Fan a fired reminder out to its enabled channels. Each send is best-effort (sendEmail swallows
// its own errors) so one failing channel never blocks the others. The in-app branch is added in a
// later task.
export async function dispatchReminderChannels(ctx: ReminderDispatchContext): Promise<void> {
  const copy = reminderNotificationCopy({ title: ctx.reminder.title })
  if (ctx.channels.email) {
    await sendEmail({
      to: ctx.user.email,
      subject: copy.title,
      html: reminderEmail(copy, ctx.href ?? "/dashboard/reminders"),
    })
  }
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
}
