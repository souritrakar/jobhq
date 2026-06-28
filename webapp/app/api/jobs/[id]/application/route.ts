import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { attachApplicationFromUrl } from "@/lib/server/job-import"
import { attachApplicationSchema } from "@/lib/validations/job-import"

// Like the import route, this does a Firecrawl scrape and needs a long budget in production.
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

// POST /api/jobs/:id/application — attach the application form from a SECOND URL to a job we
// already saved (the "the apply form is on a separate page" case). ONE Firecrawl scrape reads
// just the form; the questions are upserted onto the job. Keys stay server-side.
export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const userId = await getUserId(req)
  const { id } = await params
  const { url } = attachApplicationSchema.parse(await req.json())
  const job = await attachApplicationFromUrl(userId, id, url)
  return ok(job)
})

export const OPTIONS = preflight
