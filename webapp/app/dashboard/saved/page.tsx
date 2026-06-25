import { getServerUserId } from "@/lib/auth/current-user"
import { listJobs } from "@/lib/server/jobs"
import { toJobCardData } from "@/components/dashboard/job-card"
import { SavedJobsBrowser } from "@/components/dashboard/saved-jobs-browser"

// Per-user saved jobs. Same cards as the dashboard's "recently saved", but the
// full list (search + filter applied client-side).
export const dynamic = "force-dynamic"

export default async function SavedJobsPage() {
  const userId = getServerUserId()
  const jobs = await listJobs(userId, { limit: 100 })

  return <SavedJobsBrowser jobs={jobs.map(toJobCardData)} />
}
