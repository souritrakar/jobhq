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
import { TrackingPanel } from "@/components/dashboard/job-detail/tracking-panel"
import { NotesPanel } from "@/components/dashboard/job-detail/notes-panel"
import { TodoPanel } from "@/components/dashboard/job-detail/todo-panel"
import { parseQuestions } from "@/components/dashboard/job-detail/questions"

export const dynamic = "force-dynamic"

// Read one job (scoped to the user) or fall back to the framework 404. Shared by the page and
// its metadata so both agree on existence.
async function loadJob(id: string) {
  try {
    return await getJob(await getServerUserId(), id)
  } catch (e) {
    if (e instanceof ApiError && e.code === "NOT_FOUND") notFound()
    throw e
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const job = await getJob(await getServerUserId(), id)
    return { title: `${job.title} · jobhq` }
  } catch {
    return { title: "Job · jobhq" }
  }
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await getServerUserId()
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
          updatedAt: job.updatedAt,
        }}
      />

      {/* Spec bar stays at identity level — the salary/location strip scans best right under the
          title, before the working area splits. */}
      <JobFacts
        job={{
          salary: job.salary,
          location: job.location,
          workplaceType: job.workplaceType,
          employmentType: job.employmentType,
        }}
      />

      {/* Quiet tracking/resume metadata lives in a sticky LEFT sidebar; the working column on the
          right leads with the user's own Notes + Reminders, then the posting content. On mobile the
          working column comes first (order swap) so Notes still opens the page. */}
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:order-2">
          <NotesPanel jobId={job.id} notes={job.notes} />
          <TodoPanel jobId={job.id} reminders={reminders} />

          {/* The posting itself sits below the seeker's own working tools, set off by a hairline. */}
          <div className="mt-1 flex flex-col gap-8 border-t border-border/60 pt-7">
            {job.description && <JobDescription description={job.description} />}
            <ApplicationForm
              questions={questions}
              jobId={job.id}
              hasResume={Boolean(job.resumeDocumentId)}
              answers={answers}
            />
          </div>
        </div>

        <aside className="lg:order-1 lg:sticky lg:top-8 lg:self-start">
          <TrackingPanel
            job={{
              id: job.id,
              interviewAt: job.interviewAt,
            }}
            reminders={reminders}
            resumes={resumes}
            selectedResumeId={job.resumeDocumentId}
          />
        </aside>
      </div>
    </div>
  )
}
