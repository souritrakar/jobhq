import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { saveApplicationAnswers } from "@/lib/server/application-answers"
import { saveAnswersSchema } from "@/lib/validations/application-answer"

type Ctx = { params: Promise<{ id: string }> }

// PUT /api/jobs/:id/application/answers — save a batch of answers (the form's manual "Save
// changes"). One transaction upserts each (application, question) row and clears any emptied ones,
// so a whole form saves in a single request rather than one upsert per field. Returns the saved
// values as a { questionId: value } map.
export const PUT = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  const { answers } = saveAnswersSchema.parse(await req.json())
  const saved = await saveApplicationAnswers(userId, id, answers)
  return ok(saved)
})

export const OPTIONS = preflight
