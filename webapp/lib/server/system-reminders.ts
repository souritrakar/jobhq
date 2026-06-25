import { sendEmail } from "@/lib/email/client"
import { digestEmail } from "@/lib/email/templates"
import { prisma } from "@/lib/db"
import { digestCopy } from "@/lib/reminders/copy"
import { cancelScheduledDelivery, scheduleReminderDelivery } from "@/lib/reminders/scheduler"
import { createNotification } from "@/lib/server/notifications"

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

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { company: true },
  })
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

// --- "jobs needing attention" digest -----------------------------------------------------------
// v1 uses hardcoded defaults (no per-user NotificationPreference yet): a daily cron sweep emails
// every user whose SAVED jobs have gone untouched. The once-a-day cron schedule is the throttle.

const STALE_AFTER_DAYS = 3
const DIGEST_SAMPLE = 5

/** The updatedAt boundary: a SAVED job older than this is "needs attention". Pure. */
export function staleCutoff(now: Date, staleAfterDays = STALE_AFTER_DAYS): Date {
  return new Date(now.getTime() - staleAfterDays * 24 * 60 * 60 * 1000)
}

/**
 * Daily digest sweep. Every user with SAVED jobs left untouched for >= STALE_AFTER_DAYS gets one
 * in-app + one email summary of those roles. No preferences lookup (deferred) — channels are both
 * on by default. Per-user failures are isolated so one bad send never aborts the whole sweep.
 */
export async function runDigest(now: Date): Promise<{ usersNotified: number }> {
  const cutoff = staleCutoff(now)
  const staleJobs = await prisma.job.findMany({
    where: { status: "SAVED", updatedAt: { lt: cutoff } },
    orderBy: { updatedAt: "asc" },
    select: { title: true, company: true, userId: true, user: { select: { email: true } } },
  })

  // One digest per user, covering all of their stale roles.
  const byUser = new Map<string, { email: string; jobs: { title: string; company: string }[] }>()
  for (const j of staleJobs) {
    const entry = byUser.get(j.userId) ?? { email: j.user.email, jobs: [] }
    entry.jobs.push({ title: j.title, company: j.company })
    byUser.set(j.userId, entry)
  }

  let usersNotified = 0
  for (const [userId, { email, jobs }] of byUser) {
    try {
      const copy = digestCopy({ count: jobs.length, sample: jobs.slice(0, DIGEST_SAMPLE) })
      await createNotification(userId, {
        kind: "DIGEST",
        title: copy.title,
        body: copy.body,
        href: "/dashboard/saved",
      })
      await sendEmail({
        to: email,
        subject: copy.title,
        html: digestEmail(copy, "/dashboard/saved"),
      })
      usersNotified++
    } catch (err) {
      console.error("[digest] user failed", userId, err)
    }
  }
  return { usersNotified }
}
