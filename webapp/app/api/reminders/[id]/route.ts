import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { deleteReminder, updateReminder } from "@/lib/server/reminders"
import { updateReminderSchema } from "@/lib/validations/reminder"

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/reminders/:id — toggle done, edit text, or change/clear the due date.
export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  const input = updateReminderSchema.parse(await req.json())
  return ok(await updateReminder(userId, id, input))
})

// DELETE /api/reminders/:id — remove a reminder.
export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  await deleteReminder(userId, id)
  return ok({ id, deleted: true })
})

export const OPTIONS = preflight
