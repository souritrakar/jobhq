import { ClipboardList, Star } from "lucide-react"

import { Card } from "@/components/ui/card"
import { ApplicationAnswers } from "./application-answers"
import type { StoredQuestion } from "./questions"

/**
 * The captured application form. Every question is its real control; text answers are editable, with
 * an AI draft on long-answer fields (grounded in the job + the resume selected in the rail). Edits
 * are held locally and committed together via the bottom "Save changes" bar (see ApplicationAnswers)
 * — nothing autosaves. Choice/upload fields are still an answer-ready preview.
 */
export function ApplicationForm({
  questions,
  jobId,
  hasResume,
  answers,
}: {
  questions: StoredQuestion[]
  jobId: string
  /** Whether a resume is selected for this job — gates AI drafting across the form's text fields. */
  hasResume: boolean
  /** Persisted answers, keyed by question id, to seed the fields. */
  answers: Record<string, string>
}) {
  const required = questions.filter((q) => q.required).length
  const flagged = questions.filter((q) => q.flagged).length

  return (
    <section aria-labelledby="application-heading" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="application-heading" className="text-sm font-semibold tracking-tight">
            Application
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {questions.length > 0
              ? "Fill it in — review your answers, then save your changes."
              : "The questions this posting asks will appear here."}
          </p>
        </div>
        {questions.length > 0 && (
          <p className="hidden shrink-0 items-center gap-1.5 text-[13px] tabular-nums text-muted-foreground sm:flex">
            <span>
              {questions.length} {questions.length === 1 ? "question" : "questions"}
            </span>
            {required > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{required} required</span>
              </>
            )}
            {flagged > 0 && (
              <>
                <span aria-hidden>·</span>
                {/* Flagged count carries the same gold star as the per-question marker, so the
                    summary visually matches what the user starred below. */}
                <span className="inline-flex items-center gap-1 font-medium text-[oklch(0.48_0.11_85)]">
                  <Star className="size-3 fill-current" />
                  {flagged} flagged
                </span>
              </>
            )}
          </p>
        )}
      </div>

      {questions.length === 0 ? (
        <EmptyApplication />
      ) : (
        <Card className="rounded-lg border-border bg-background">
          <ApplicationAnswers
            questions={questions}
            jobId={jobId}
            hasResume={hasResume}
            initialAnswers={answers}
          />
        </Card>
      )}
    </section>
  )
}

function EmptyApplication() {
  return (
    <Card className="flex flex-col items-center gap-2 rounded-lg border-border px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">
        <ClipboardList className="size-5" />
      </span>
      <p className="mt-1 text-sm font-medium">No application form captured</p>
      <p className="max-w-xs text-[13px] text-muted-foreground">
        Capture a posting&apos;s questions with the extension and they&apos;ll show up here, ready
        to fill.
      </p>
    </Card>
  )
}
