import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { extractApplication } from "@/lib/server/application-extractions"
import { applicationExtractInputSchema } from "@/lib/validations/extract"

// POST /api/extract-application — run the LLM over a captured application FORM and return
// its questions as a typed array. The extension captures the rendered form (per the user's
// manual "Extract application questions" action) and sends the text here; the Groq key stays
// server-side and every call's token usage is logged.
//
// Returns { data: { questions, usage } }. Answers are not persisted here — the extension
// renders the questions as fillable controls only (for now).
export const POST = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  const input = applicationExtractInputSchema.parse(await req.json())
  const result = await extractApplication(userId, input)
  return ok(result)
})

export const OPTIONS = preflight
