import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { extractApplicationTiered } from "@/lib/server/application-extractions-tiered"
import { tieredApplicationExtractInputSchema } from "@/lib/validations/extract-tiered"

// POST /api/extract-application/tiered — the NON-LLM alternative to POST /api/extract-application. The
// extension harvests the form's controls (label + kind + native input type + options + required) and
// sends them here; we map them to typed questions and run an embeddings inclusion gate to drop page
// noise (search/login/cookie). No Groq call. Returns the SAME { data: { questions, usage } } shape as
// /api/extract-application, so the extension can plug in either path. Both routes stay live for A/B.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = tieredApplicationExtractInputSchema.parse(await req.json())
  const result = await extractApplicationTiered(userId, input)
  return ok(result)
})

export const OPTIONS = preflight
