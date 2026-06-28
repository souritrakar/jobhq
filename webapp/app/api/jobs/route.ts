import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { created, ok, preflight, withRoute } from "@/lib/api/route"
import { createJob, listJobs, updateJobStatuses } from "@/lib/server/jobs"
import {
  bulkStatusUpdateSchema,
  createJobSchema,
  listJobsQuerySchema,
} from "@/lib/validations/job"

// GET /api/jobs — list the current user's saved jobs (optionally filtered by status).
export const GET = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const query = listJobsQuerySchema.parse(
    Object.fromEntries(req.nextUrl.searchParams),
  )
  const jobs = await listJobs(userId, query)
  return ok(jobs)
})

// POST /api/jobs — capture a new job posting.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const input = createJobSchema.parse(await req.json())
  const job = await createJob(userId, input)
  return created(job)
})

// PATCH /api/jobs — bulk-move pipeline status for many jobs in one transaction. The Kanban board
// coalesces a flurry of drag-and-drops into a single batched, debounced call to this endpoint.
export const PATCH = withRoute(async (req: NextRequest) => {
  const userId = await getUserId(req)
  const { changes } = bulkStatusUpdateSchema.parse(await req.json())
  const result = await updateJobStatuses(userId, changes)
  return ok(result)
})

export const OPTIONS = preflight
