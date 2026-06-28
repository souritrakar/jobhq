import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Bookmark, CalendarClock, FileText, Globe, History, Activity } from "lucide-react"

import { cn } from "@/lib/utils"
import { savedLabel } from "@/lib/dates"
import { siteNameFromUrl } from "@/lib/url"
import type { Reminder } from "@/lib/reminders/types"
import type { ResumeSummary } from "@/lib/resumes/types"
import { PanelCard } from "./panel-card"
import { JobResumeCard } from "./job-resume-card"
import { InterviewDate } from "./interview-date"

// A fuller date for the provenance rows (the facts bar already carries any deadline).
function fullDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value)
}

/**
 * The left utility sidebar: the job's provenance ("when saved / last touched / where from"), the
 * interview control, and the resume picker — the lower-frequency metadata, kept out of the reading
 * column so Notes and Reminders own the eye. Icon-led rows make each fact scannable at a glance.
 */
export function TrackingPanel({
  job,
  reminders,
  resumes,
  selectedResumeId,
}: {
  job: {
    id: string
    url: string | null
    source: string | null
    interviewAt: Date | null
    createdAt: Date
    updatedAt: Date
  }
  reminders: Reminder[]
  resumes: ResumeSummary[]
  selectedResumeId: string | null
}) {
  const site = job.source ?? siteNameFromUrl(job.url)
  // The auto-generated SYSTEM "interview" reminder — tells the Interview control whether the
  // heads-up has already gone out or been ticked off.
  const interviewReminder = reminders.find((r) => r.type === "system")

  return (
    <div className="flex flex-col gap-4">
      <PanelCard icon={Activity} title="Tracking">
        <dl className="flex flex-col">
          <Row icon={Bookmark} label="Saved">
            {fullDate(job.createdAt)}
          </Row>
          <Row icon={History} label="Updated">
            {savedLabel(job.updatedAt)}
          </Row>
          {site && (
            <Row icon={Globe} label="Source" muted>
              {site}
            </Row>
          )}
        </dl>

        {/* Interview gets its own raised block — it's the date the user actually acts on, not
            just provenance. The control tints it amber once the interview has passed. */}
        <div className="mt-4 rounded-xl border border-border/70 bg-secondary/50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            <CalendarClock className="size-3.5" />
            Interview
          </div>
          <InterviewDate
            jobId={job.id}
            interviewAt={job.interviewAt ? job.interviewAt.toISOString() : null}
            reminderDone={interviewReminder?.done ?? false}
            reminderDeliveredAt={interviewReminder?.deliveredAt ?? null}
          />
        </div>
      </PanelCard>

      <PanelCard icon={FileText} title="Resume">
        <JobResumeCard jobId={job.id} resumes={resumes} selectedId={selectedResumeId} />
      </PanelCard>
    </div>
  )
}

// One provenance row: leading icon + label on the left, value on the right. `muted` drops the
// value to label weight (used for Source, which rarely warrants the emphasis dates get).
function Row({
  icon: Icon,
  label,
  muted = false,
  children,
}: {
  icon: LucideIcon
  label: string
  muted?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5 shrink-0 opacity-70" />
        {label}
      </dt>
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
