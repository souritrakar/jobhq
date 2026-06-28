import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { draftApplicationAnswer } from "@/lib/server/answer-draft"
import { draftAnswerSchema } from "@/lib/validations/application-answer"

// One non-streaming model call. It's short, but give it headroom over a default function budget so
// a slow upstream doesn't get killed mid-draft (the client + lib/llm/openrouter.ts both also bound it).
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

// POST /api/jobs/:id/application/draft — AI-draft one question's answer from the job + the user's
// selected resume. Returns the full answer as JSON `{ data: { value } }` (NOT a stream). Every clean
// failure (no resume selected, unreadable resume, unknown question, rate limit) comes back as the
// standard `{ error }` envelope so the field can surface it inline.
export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  const { questionId } = draftAnswerSchema.parse(await req.json())
  const draft = await draftApplicationAnswer(userId, id, questionId)
  return ok(draft)
})

export const OPTIONS = preflight
