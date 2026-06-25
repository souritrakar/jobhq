import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { savedLabel } from "@/lib/dates"
import { siteNameFromUrl } from "@/lib/url"
import { displayCompany } from "@/components/dashboard/logo-tile"
import { Card } from "@/components/ui/card"
import type { Reminder } from "@/lib/reminders/types"
import type { ResumeSummary } from "@/lib/resumes/types"
import { JobResumeCard } from "./job-resume-card"
import { NotesEditor } from "./notes-editor"
import { RemindersCard } from "./reminders-card"
import { InterviewDate } from "./interview-date"

// A fuller date for the rail's provenance rows (the facts bar already carries the deadline).
function fullDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value)
}

/**
 * The right-hand provenance + notes column. Holds the lower-priority, glanceable metadata
 * (when it was saved, last touched, where it came from) and the private notes editor — kept out
 * of the main reading column so the title → facts → description → form spine stays clean.
 */
export function TrackingRail({
  job,
  reminders,
  resumes,
  selectedResumeId,
}: {
  job: {
    id: string
    company: string
    url: string | null
    source: string | null
    notes: string | null
    interviewAt: Date | null
    createdAt: Date
    updatedAt: Date
  }
  reminders: Reminder[]
  resumes: ResumeSummary[]
  selectedResumeId: string | null
}) {
  const site = job.source ?? siteNameFromUrl(job.url)

  return (
    <aside className="flex flex-col gap-4">
      <Card className="rounded-lg border-border p-4">
        <RailHeader>Tracking</RailHeader>
        <dl className="mt-1">
          <Row label="Saved">{fullDate(job.createdAt)}</Row>
          <Row label="Last updated">{savedLabel(job.updatedAt)}</Row>
          {site && (
            <Row label="Source" muted>
              {site}
            </Row>
          )}
        </dl>
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="mb-1.5 text-[14px] text-muted-foreground">Interview</p>
          <InterviewDate
            jobId={job.id}
            interviewAt={job.interviewAt ? job.interviewAt.toISOString() : null}
          />
        </div>
      </Card>

      <Card className="rounded-lg border-border p-4">
        <RailHeader>Resume</RailHeader>
        <div className="mt-3">
          <JobResumeCard jobId={job.id} resumes={resumes} selectedId={selectedResumeId} />
        </div>
      </Card>

      <Card className="rounded-lg border-border p-4">
        <RailHeader>Notes</RailHeader>
        <div className="mt-3">
          <NotesEditor jobId={job.id} notes={job.notes} />
        </div>
      </Card>

      <Card className="rounded-lg border-border p-4">
        <RailHeader>Reminders</RailHeader>
        <div className="mt-3">
          <RemindersCard
            jobId={job.id}
            company={displayCompany(job.company)}
            reminders={reminders}
          />
        </div>
      </Card>
    </aside>
  )
}

function RailHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </h2>
  )
}

// `muted` drops a value to label weight + tone (used for Source, which rarely warrants the
// emphasis the date values get).
function Row({
  label,
  muted = false,
  children,
}: {
  label: string
  muted?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-[14px] last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "truncate text-right",
          muted ? "font-normal text-muted-foreground" : "font-medium text-foreground",
        )}
      >
        {children}
      </dd>
    </div>
  )
}
