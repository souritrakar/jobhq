import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { getApplicationAnswers } from "@/lib/server/application-answers"
import { deleteJob, getJob, updateJob } from "@/lib/server/jobs"
import { updateJobSchema } from "@/lib/validations/job"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/jobs/:id — fetch a single job. When it has an application form, the saved answers are
// folded in as `application.answers` (a { questionId: value } map) so a client can show the
// current values (the extension reads these to populate its read-only answer view).
export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  const job = await getJob(userId, id)
  if (!job.application) return ok(job)
  const answers = await getApplicationAnswers(userId, id)
  return ok({ ...job, application: { ...job.application, answers } })
})

// PATCH /api/jobs/:id — update tracking fields (status, deadline, notes, ...).
export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  const input = updateJobSchema.parse(await req.json())
  const job = await updateJob(userId, id, input)
  return ok(job)
})

// DELETE /api/jobs/:id — remove a job from the pipeline.
export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  await deleteJob(userId, id)
  return ok({ id, deleted: true })
})

export const OPTIONS = preflight
