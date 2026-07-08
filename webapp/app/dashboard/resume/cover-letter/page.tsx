import { getServerUserId } from "@/lib/auth/current-user"
import { listJobs } from "@/lib/server/jobs"
import { listResumes } from "@/lib/server/resumes"
import { CoverLetterGenerator } from "@/components/dashboard/cover-letter/cover-letter-generator"
import type { JobOption } from "@/components/dashboard/cover-letter/job-picker"

export const metadata = { title: "Cover Letter · jobhq" }

// The generator needs a live list of the user's saved jobs (and any imported mid-session) and their
// uploaded resumes, so it's rendered fresh per request. Both lists are fetched in parallel and are
// metadata-only — resume FILE bytes are pulled (and parsed) lazily at generation time, not here.
export const dynamic = "force-dynamic"

export default async function CoverLetterPage({
  searchParams,
}: {
  // Deep-linkable from a job's detail page ("Generate cover letter"), which passes the job and its
  // chosen resume so the generator opens with both preselected.
  searchParams: Promise<{ jobId?: string; resumeId?: string }>
}) {
  const userId = await getServerUserId()
  const [{ jobId, resumeId }, jobs, resumes] = await Promise.all([
    searchParams,
    listJobs(userId, { limit: 100 }),
    listResumes(userId),
  ])

  const jobOptions: JobOption[] = jobs.map((job) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    logoUrl: job.logoUrl,
    url: job.url,
  }))

  return (
    <CoverLetterGenerator
      jobs={jobOptions}
      resumes={resumes}
      initialJobId={jobId}
      initialResumeId={resumeId}
    />
  )
}
