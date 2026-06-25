import type { Notification } from "@prisma/client"

import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import type { NotificationDto, NotificationKind } from "@/lib/notifications/types"

const KIND_TO_CLIENT: Record<Notification["kind"], NotificationKind> = {
  REMINDER_DUE: "reminder",
  INTERVIEW: "interview",
  DIGEST: "digest",
}

// Prisma row → client `NotificationDto`: lowercase the kind enum, ISO-stringify dates, drop nulls.
// The single place the wire shape is defined.
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
  // Unchecked (scalar-FK) create: setting `reminderId`/`jobId` directly can't be combined with a
  // checked `user: { connect }` relation in the same Prisma 7 input, so use `userId` here too.
  const row = await prisma.notification.create({
    data: {
      userId,
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
    const exists = await prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    })
    if (!exists) throw ApiError.notFound("Notification not found")
  }
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })
}
