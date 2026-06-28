import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { getProfile, upsertProfile } from "@/lib/server/profile"
import { profileSchema } from "@/lib/validations/profile"

// GET /api/profile — the current user's saved autofill profile, or null if they haven't saved one.
// Also the extension's autofill source (read once, prefill application forms).
export const GET = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  return ok(await getProfile(userId))
})

// PUT /api/profile — create or replace the user's autofill profile from the Settings form.
export const PUT = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = profileSchema.parse(await req.json())
  return ok(await upsertProfile(userId, input))
})

export const OPTIONS = preflight
