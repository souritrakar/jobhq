import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { extractJobTiered } from "@/lib/server/extractions-tiered"
import { tieredExtractInputSchema } from "@/lib/validations/extract-tiered"

// POST /api/extract/tiered — the NON-LLM alternative to POST /api/extract. The extension sends the
// page's machine-readable signals (JSON-LD, meta tags, key/value segments, h1) instead of raw markdown;
// we parse the structured data and fall back to a cheap embeddings match for any leftover attribute
// fields. No Groq call. Returns the SAME { data: { fields, description?, usage } } shape as /api/extract,
// so the extension can plug in either path. Both routes stay live for A/B.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = tieredExtractInputSchema.parse(await req.json())
  const result = await extractJobTiered(userId, input)
  return ok(result)
})

export const OPTIONS = preflight
