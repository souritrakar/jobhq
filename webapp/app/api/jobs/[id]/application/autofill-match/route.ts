import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { buildAutofillPlan } from "@/lib/server/autofill"
import { autofillMatchSchema } from "@/lib/validations/autofill"

// One small embeddings call + in-memory cosine — fast, but give a little headroom over a default
// function budget so a slow embeddings upstream doesn't get killed mid-match.
export const maxDuration = 30

type Ctx = { params: Promise<{ id: string }> }

// POST /api/jobs/:id/application/autofill-match — the extension posts the page's harvested input fields
// `{ fields: [{ id, label, kind, options? }] }`; the server semantically matches each SAVED application
// question to its field (question → field direction) and returns a fill plan:
// `{ data: { matched: [{ questionId, fieldId, value, optionValues, isDefault, score }], unmatched: [{ questionId, label }] } }`.
// Answer values are reloaded from the DB server-side — the request carries no answer content.
export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  const { fields } = autofillMatchSchema.parse(await req.json())
  const plan = await buildAutofillPlan(userId, id, fields)
  return ok(plan)
})

export const OPTIONS = preflight
