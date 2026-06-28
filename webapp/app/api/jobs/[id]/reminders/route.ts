import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { created, ok, preflight, withRoute } from "@/lib/api/route"
import { createReminder, listJobReminders } from "@/lib/server/reminders"
import { createReminderSchema } from "@/lib/validations/reminder"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/jobs/:id/reminders — list reminders for one posting.
export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  return ok(await listJobReminders(userId, id))
})

// POST /api/jobs/:id/reminders — create a reminder linked to this posting.
export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  const input = createReminderSchema.parse(await req.json())
  return created(await createReminder(userId, id, input))
})

export const OPTIONS = preflight
