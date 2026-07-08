import { CalendarClock, FileText } from "lucide-react"

import type { Reminder } from "@/lib/reminders/types"
import type { ResumeSummary } from "@/lib/resumes/types"
import { PanelCard } from "./panel-card"
import { JobResumeCard } from "./job-resume-card"
import { InterviewDate } from "./interview-date"

/**
 * The left utility sidebar: the resume picker and the interview control. Provenance ("when saved /
 * last touched / where from") now lives inline under the title, so the rail leads with the resume
 * — the highest-value action here — with the interview date directly beneath it.
 */
export function TrackingPanel({
  job,
  reminders,
  resumes,
  selectedResumeId,
}: {
  job: {
    id: string
    interviewAt: Date | null
  }
  reminders: Reminder[]
  resumes: ResumeSummary[]
  selectedResumeId: string | null
}) {
  // The auto-generated SYSTEM "interview" reminder — tells the Interview control whether the
  // heads-up has already gone out or been ticked off.
  const interviewReminder = reminders.find((r) => r.type === "system")

  return (
    <div className="flex flex-col gap-4">
      <PanelCard icon={FileText} title="Resume">
        <JobResumeCard jobId={job.id} resumes={resumes} selectedId={selectedResumeId} />
      </PanelCard>

      <PanelCard icon={CalendarClock} title="Interview">
        <InterviewDate
          jobId={job.id}
          interviewAt={job.interviewAt ? job.interviewAt.toISOString() : null}
          reminderDone={interviewReminder?.done ?? false}
          reminderDeliveredAt={interviewReminder?.deliveredAt ?? null}
        />
      </PanelCard>
    </div>
  )
}
