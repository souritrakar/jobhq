import type { Reminder, User } from "@prisma/client"

import { sendEmail } from "@/lib/email/client"
import { reminderEmail } from "@/lib/email/templates"
import { reminderNotificationCopy } from "@/lib/reminders/copy"
import { createNotification } from "@/lib/server/notifications"

export type ReminderDispatchContext = {
  reminder: Pick<Reminder, "id" | "title" | "jobId" | "type">
  // role + company for a job-linked reminder, so the body can name the role; null for a standalone
  // reminder not tied to a job.
  job: { role: string; company: string } | null
  user: Pick<User, "id" | "email">
  // resolved channel switches + deep link, filled by the delivery module
  channels: { inApp: boolean; email: boolean }
  href: string | null
}

// Fan a fired reminder out to its enabled channels. Each send is best-effort (sendEmail swallows
// its own errors) so one failing channel never blocks the others.
export async function dispatchReminderChannels(ctx: ReminderDispatchContext): Promise<void> {
  const copy = reminderNotificationCopy({
    title: ctx.reminder.title,
    role: ctx.job?.role,
    company: ctx.job?.company,
  })
  if (ctx.channels.email) {
    await sendEmail({
      to: ctx.user.email,
      subject: `REMINDER : ${ctx.reminder.title}`,
      html: reminderEmail(
        { title: copy.title, where: copy.where },
        ctx.href ?? "/dashboard/reminders",
      ),
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
