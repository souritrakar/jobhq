import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { created, ok, preflight, withRoute } from "@/lib/api/route"
import { createReminder, listReminders, listUpcomingReminders } from "@/lib/server/reminders"
import { createReminderSchema } from "@/lib/validations/reminder"

// GET /api/reminders — full list, or with ?upcoming=1[&days=30] only not-done reminders due in the
// next N days (what the extension's alarm sync registers locally).
export const GET = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  const url = new URL(req.url)
  if (url.searchParams.get("upcoming")) {
    const days = Number(url.searchParams.get("days") ?? "30")
    return ok(await listUpcomingReminders(userId, Number.isFinite(days) ? days : 30))
  }
  return ok(await listReminders(userId))
})

// POST /api/reminders — create a standalone reminder (not tied to a posting). Per-job reminders
// go through /api/jobs/:id/reminders instead.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  const input = createReminderSchema.parse(await req.json())
  return created(await createReminder(userId, null, input))
})

export const OPTIONS = preflight
