import type { NextRequest } from "next/server"

import { ok, preflight, withRoute } from "@/lib/api/route"
import { getUserId } from "@/lib/auth/current-user"
import { listNotifications } from "@/lib/server/notifications"

export const GET = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  return ok(await listNotifications(userId))
})

export const OPTIONS = preflight
