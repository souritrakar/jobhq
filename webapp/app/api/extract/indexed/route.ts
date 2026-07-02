import type { NextRequest } from "next/server"

import { ok, preflight, withRoute } from "@/lib/api/route"
import { getUserId } from "@/lib/auth/current-user"
import { extractJobIndexed } from "@/lib/server/extractions-indexed"
import { indexedExtractInputSchema } from "@/lib/validations/extract-indexed"

// POST /api/extract/indexed — block-addressed job-details extraction (see
// docs/superpowers/specs/2026-07-01-indexed-extraction-design.md). The extension sends the
// page as numbered blocks + harvested fields; the model points at content; values resolve
// deterministically. Returns { data: { fields, description?, detected, usage } }.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = indexedExtractInputSchema.parse(await req.json())
  const result = await extractJobIndexed(userId, input)
  return ok(result)
})

export const OPTIONS = preflight
