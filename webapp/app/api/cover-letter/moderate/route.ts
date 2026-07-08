import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { moderateText } from "@/lib/llm/moderation"
import { moderateLetterSchema } from "@/lib/validations/cover-letter"

// Classifier answers in a handful of tokens; it never needs the generation budget.
export const maxDuration = 20

// POST /api/cover-letter/moderate — Stage 4 output safety.
//
// The generator streams the letter to the client; once it's complete the client posts it back here
// so the finished text is classified before it's treated as usable (export stays disabled until this
// returns clean). Returns `{ flagged }`. moderateText fails open (see lib/llm/moderation.ts), so an
// unavailable classifier degrades to "not flagged" rather than blocking every letter.
export const POST = withRoute(async (req: NextRequest) => {
  await getUserId(req) // authenticated users only — don't expose a free classifier to anon callers
  const { text } = moderateLetterSchema.parse(await req.json())
  const result = await moderateText(text)
  return ok({ flagged: result.flagged })
})

export const OPTIONS = preflight
