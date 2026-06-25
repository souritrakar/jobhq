import type { NextRequest } from "next/server"

import { getUserId } from "@/lib/auth/current-user"
import { ok, preflight, withRoute } from "@/lib/api/route"
import { importJobFromUrl } from "@/lib/server/job-import"
import { importJobSchema } from "@/lib/validations/job-import"

// One Firecrawl scrape can take 50–100s on JS-heavy postings, so this function needs a long
// budget in production (Vercel kills the default 10–15s). Match the client's API timeout.
export const maxDuration = 120

// POST /api/jobs/import — save a job from a posting URL, no extension required. ONE Firecrawl
// scrape extracts the details + application questions + logo; the result is saved through the
// same path as every other job (createJob), deduped by URL. Keys stay server-side.
//
// Returns a discriminated result, not just the job, because the details and the application
// form can live on different URLs: `{ outcome: "saved", job }` or `{ outcome: "application_only",
// questions }` (an apply page with no job identity — the client then supplies the posting URL,
// passing the questions back as `carryQuestions`). "Found neither" is a 400.
export const POST = withRoute(async (req: NextRequest) => {
  const userId = getUserId(req)
  const { url, carryQuestions } = importJobSchema.parse(await req.json())
  const result = await importJobFromUrl(userId, url, carryQuestions)
  return ok(result)
})

export const OPTIONS = preflight
