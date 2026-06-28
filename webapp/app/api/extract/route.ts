import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { extractJob } from "@/lib/server/extractions"
import { extractInputSchema } from "@/lib/validations/extract"

// POST /api/extract — run the LLM over a scoped slice of a job posting and return the
// structured fields. The extension scopes the page (per site) and sends the text here;
// the Groq key stays server-side and every call's token usage is logged for tuning.
//
// Returns { data: { fields, usage } }. `description` is not extracted here — the
// extension captures it from the page and sends it directly to POST /api/jobs on save.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = extractInputSchema.parse(await req.json())
  const result = await extractJob(userId, input)
  return ok(result)
})

export const OPTIONS = preflight
