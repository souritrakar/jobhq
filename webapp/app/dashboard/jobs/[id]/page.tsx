import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { ApiError } from "@/lib/api/errors"
import { getServerUserId } from "@/lib/auth/current-user"
import { getJob } from "@/lib/server/jobs"
import { getApplicationAnswers } from "@/lib/server/application-answers"
import { listJobReminders } from "@/lib/server/reminders"
import { listResumes } from "@/lib/server/resumes"
import { JobDetailHeader } from "@/components/dashboard/job-detail/job-detail-header"
import { JobFacts } from "@/components/dashboard/job-detail/job-facts"
import { JobDescription } from "@/components/dashboard/job-detail/job-description"
import { ApplicationForm } from "@/components/dashboard/job-detail/application-form"
import { TrackingRail } from "@/components/dashboard/job-detail/tracking-rail"
import { parseQuestions } from "@/components/dashboard/job-detail/questions"

export const dynamic = "force-dynamic"

// Read one job (scoped to the user) or fall back to the framework 404. Shared by the page and
// its metadata so both agree on existence.
async function loadJob(id: string) {
  try {
    return await getJob(getServerUserId(), id)
  } catch (e) {
    if (e instanceof ApiError && e.code === "NOT_FOUND") notFound()
    throw e
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const job = await getJob(getServerUserId(), id)
    return { title: `${job.title} — JobTracker` }
  } catch {
    return { title: "Job — JobTracker" }
  }
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = getServerUserId()
  const job = await loadJob(id)
  const questions = parseQuestions(job.application?.questions ?? null)
  const [reminders, resumes, answers] = await Promise.all([
    listJobReminders(userId, id),
    listResumes(userId),
    getApplicationAnswers(userId, id),
  ])

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/saved"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Jobs
      </Link>

      <JobDetailHeader
        job={{
          id: job.id,
          title: job.title,
          company: job.company,
          source: job.source,
          url: job.url,
          status: job.status,
        }}
      />

      {/* Single reading spine on the left (facts → description → application), provenance + notes
          in a sticky rail on the right. Collapses to one column below lg. */}
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <JobFacts
            job={{
              salary: job.salary,
              location: job.location,
              workplaceType: job.workplaceType,
              employmentType: job.employmentType,
            }}
          />
          {job.description && <JobDescription description={job.description} />}
          <ApplicationForm
            questions={questions}
            jobId={job.id}
            hasResume={Boolean(job.resumeDocumentId)}
            answers={answers}
          />
        </div>

        <div className="lg:sticky lg:top-8 lg:self-start">
          <TrackingRail
            job={{
              id: job.id,
              company: job.company,
              url: job.url,
              source: job.source,
              notes: job.notes,
              interviewAt: job.interviewAt,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
            }}
            reminders={reminders}
            resumes={resumes}
            selectedResumeId={job.resumeDocumentId}
          />
        </div>
      </div>
    </div>
  )
}
