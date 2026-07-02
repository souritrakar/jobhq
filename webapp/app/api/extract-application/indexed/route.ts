import type { NextRequest } from "next/server"

import { ok, preflight, withRoute } from "@/lib/api/route"
import { getUserId } from "@/lib/auth/current-user"
import { extractApplicationIndexed } from "@/lib/server/application-extractions-indexed"
import { indexedExtractInputSchema } from "@/lib/validations/extract-indexed"

// POST /api/extract-application/indexed — block-addressed application-question extraction.
// The model classifies the REAL harvested controls (never invents); options are copied
// verbatim from the DOM. Returns { data: { questions, detected, usage } }.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = indexedExtractInputSchema.parse(await req.json())
  const result = await extractApplicationIndexed(userId, input)
  return ok(result)
})

export const OPTIONS = preflight
