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
 * Whether to schedule a delivery for an interview reminder: only while the interview itself is still
 * ahead of `now`. A past interview would otherwise fire "now" (QStash delivers a past notBefore
 * immediately) — a heads-up for something already over. An interview inside the lead window still
 * schedules on purpose so the nudge goes out right away. Pure, so the timing rule is unit-tested.
 */
export function shouldScheduleInterviewReminder(interviewAt: Date, now: Date): boolean {
  return interviewAt.getTime() > now.getTime()
}

/**
 * Keep exactly one SYSTEM interview reminder per job in sync with Job.interviewAt.
 * - interviewAt set    → upsert reminder, (re)schedule QStash.
 * - interviewAt cleared → delete reminder + cancel its QStash message.
 * Idempotent via the (jobId, systemKey) unique constraint.
 *
 * Two distinct times are in play, and keeping them apart is the whole point:
 *   • `dueAt` = the interview instant itself — the ONLY time the user ever sees (the To-do row,
 *     the reminders feed, the interview card all read `dueAt`). It is what the reminder is *about*.
 *   • `fireAt` = interviewAt - lead (24h) — when we actually deliver the heads-up. This lives only
 *     in the QStash schedule (notBefore) and is never surfaced, so the user is never shown a
 *     confusing "due yesterday" time for an interview that is tomorrow.
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
      // Show the interview time; deliver the heads-up `fireAt` (24h earlier) via QStash below.
      dueAt: interviewAt,
      hasTime: true,
      deliveredAt: null,
    },
    update: { title, dueAt: interviewAt, deliveredAt: null, done: false },
    select: { id: true },
  })

  // Only schedule a delivery while the interview is still ahead of us. If it's already in the past
  // (past date, or a same-day edit to an earlier time), fireAt is past too — QStash treats a past
  // notBefore as "deliver now", which would fire a heads-up for an interview that already happened.
  // The row still exists so the UI can show "Interview has passed"; it just won't fire. When the
  // interview is within the next lead window, fireAt is slightly past on purpose so the nudge goes
  // out right away ("your interview is soon").
  const messageId = shouldScheduleInterviewReminder(interviewAt, new Date())
    ? await scheduleReminderDelivery(row.id, fireAt)
    : null
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
      const sample = jobs.slice(0, DIGEST_SAMPLE)
      const copy = digestCopy({ count: jobs.length, sample })
      await createNotification(userId, {
        kind: "DIGEST",
        title: copy.title,
        body: copy.body,
        href: "/dashboard/saved",
      })
      await sendEmail({
        to: email,
        subject: copy.title,
        html: digestEmail(copy, sample, jobs.length - sample.length, "/dashboard/saved"),
      })
      usersNotified++
    } catch (err) {
      console.error("[digest] user failed", userId, err)
    }
  }
  return { usersNotified }
}
