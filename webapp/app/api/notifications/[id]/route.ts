import type { NextRequest } from "next/server"

import { ok, preflight, withRoute } from "@/lib/api/route"
import { getUserId } from "@/lib/auth/current-user"
import { markRead } from "@/lib/server/notifications"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = getUserId(req)
  const { id } = await params
  await markRead(userId, id)
  return ok({ id })
})

export const OPTIONS = preflight
