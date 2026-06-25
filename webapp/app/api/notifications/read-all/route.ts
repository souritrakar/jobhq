import type { NextRequest } from "next/server"

import { ok, preflight, withRoute } from "@/lib/api/route"
import { getUserId } from "@/lib/auth/current-user"
import { markAllRead } from "@/lib/server/notifications"

export const POST = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  await markAllRead(userId)
  return ok({ ok: true })
})

export const OPTIONS = preflight
