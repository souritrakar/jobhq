import type { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import { cancelScheduledDelivery, scheduleReminderDelivery } from "@/lib/reminders/scheduler"
import type { Reminder } from "@/lib/reminders/types"
import type { CreateReminderInput, UpdateReminderInput } from "@/lib/validations/reminder"

/**
 * Reminders service / repository layer.
 *
 * All database access for reminders lives here, never in route handlers. Same two rules as the
 * jobs service keep it multi-tenant-safe:
 *   1. Every function takes `userId` and scopes its query to it.
 *   2. Single-row reads/writes filter by BOTH `id` and `userId`, so a user can never touch
 *      another user's reminder even if they guess an id.
 */

// The job fields the feed/rail need for the "linked posting" line. Selected (not the whole job)
// so reads stay tight.
const jobSelect = { id: true, company: true, title: true } as const

type ReminderRow = Prisma.ReminderGetPayload<{
  include: { job: { select: typeof jobSelect } }
}>

// A reminder fires only if it has a due date and isn't already done. The scheduler is told to
// (re)schedule a QStash delivery exactly when this flips true, and to cancel when it flips false.
function isDeliverable(dueAt: Date | null, done: boolean): boolean {
  return dueAt != null && !done
}

// Prisma row → client `Reminder` shape: lowercase the enum, ISO-stringify dates, and map the
// (optional) linked job. This is the single place the wire shape is defined.
export function toClientReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    type: row.type === "SYSTEM" ? "system" : "user",
    createdAt: row.createdAt.toISOString(),
    done: row.done,
    ...(row.dueAt ? { dueAt: row.dueAt.toISOString(), hasTime: row.hasTime } : {}),
    ...(row.job ? { job: row.job } : {}),
  }
}

/** Every reminder for the global feed, newest first (the feed groups by createdAt). */
export async function listReminders(userId: string): Promise<Reminder[]> {
  const rows = await prisma.reminder.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { job: { select: jobSelect } },
  })
  return rows.map(toClientReminder)
}

/** Reminders for one job: open before done, then soonest due (nulls last), newest as tiebreak. */
export async function listJobReminders(userId: string, jobId: string): Promise<Reminder[]> {
  const rows = await prisma.reminder.findMany({
    where: { userId, jobId },
    orderBy: [{ done: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    include: { job: { select: jobSelect } },
  })
  return rows.map(toClientReminder)
}

/**
 * Not-done reminders with a dueAt in [now, now+days]. Used by the extension's alarm sync to
 * (re)register local OS notifications for what's coming up.
 */
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

/** Create a reminder, optionally linked to a job (verified to belong to the user first). */
export async function createReminder(
  userId: string,
  jobId: string | null,
  input: CreateReminderInput,
): Promise<Reminder> {
  if (jobId) {
    const job = await prisma.job.findFirst({ where: { id: jobId, userId }, select: { id: true } })
    if (!job) throw ApiError.notFound("Job not found")
  }
  const row = await prisma.reminder.create({
    data: {
      user: { connect: { id: userId } },
      ...(jobId ? { job: { connect: { id: jobId } } } : {}),
      title: input.title,
      dueAt: input.dueAt,
      hasTime: input.hasTime ?? false,
    },
    include: { job: { select: jobSelect } },
  })
  // Schedule the one-shot delivery for a dated reminder and remember its message id so a later
  // edit/delete can cancel it. Scheduling failure is non-fatal (the row is already saved).
  if (isDeliverable(row.dueAt, row.done)) {
    const messageId = await scheduleReminderDelivery(row.id, row.dueAt!)
    if (messageId) {
      await prisma.reminder.update({ where: { id: row.id }, data: { qstashMessageId: messageId } })
      row.qstashMessageId = messageId
    }
  }
  return toClientReminder(row)
}

/** Update a reminder (toggle done, edit text, change/clear due date). User-scoped. */
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

  // Only touch QStash when the timing/done state actually changed: cancel the stale delivery, then
  // (if still deliverable) schedule a fresh one and reset deliveredAt so it's allowed to fire again.
  let qstashMessageId: string | null = existing.qstashMessageId
  let resetDelivered = false
  if (timingChanged) {
    await cancelScheduledDelivery(existing.qstashMessageId)
    qstashMessageId = null
    if (isDeliverable(nextDueAt ?? null, nextDone)) {
      qstashMessageId = await scheduleReminderDelivery(id, nextDueAt as Date)
      resetDelivered = true
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

/** Delete a reminder. User-scoped. */
export async function deleteReminder(userId: string, id: string): Promise<void> {
  const existing = await prisma.reminder.findFirst({
    where: { id, userId },
    select: { id: true, qstashMessageId: true },
  })
  if (!existing) throw ApiError.notFound("Reminder not found")
  await cancelScheduledDelivery(existing.qstashMessageId)
  await prisma.reminder.delete({ where: { id } })
}
