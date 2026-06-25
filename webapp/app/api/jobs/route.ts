import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { created, ok, preflight, withRoute } from "@/lib/api/route"
import { createJob, listJobs } from "@/lib/server/jobs"
import { createJobSchema, listJobsQuerySchema } from "@/lib/validations/job"

// GET /api/jobs — list the current user's saved jobs (optionally filtered by status).
export const GET = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  const query = listJobsQuerySchema.parse(
    Object.fromEntries(req.nextUrl.searchParams),
  )
  const jobs = await listJobs(userId, query)
  return ok(jobs)
})

// POST /api/jobs — capture a new job posting.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  const input = createJobSchema.parse(await req.json())
  const job = await createJob(userId, input)
  return created(job)
})

export const OPTIONS = preflight
