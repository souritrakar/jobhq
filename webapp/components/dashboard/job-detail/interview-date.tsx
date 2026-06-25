"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CircleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { patchJob } from "@/lib/jobs/client"

// Convert an ISO/Date string to the value a <input type="datetime-local"> wants
// (YYYY-MM-DDTHH:mm) in the viewer's LOCAL time. Returns "" when there's no date,
// so the control renders empty.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Set or clear this job's interview date. Persisting it (PATCH `interviewAt`) keeps a single
 * SYSTEM "interview" reminder in sync server-side, so a successful save is followed by
 * router.refresh() to pull the new reminder into the rail's Reminders card and the feed.
 */
export function InterviewDate({
  jobId,
  interviewAt,
}: {
  jobId: string
  interviewAt: string | null
}) {
  const router = useRouter()
  const [value, setValue] = useState<string>(toLocalInputValue(interviewAt))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(next: string) {
    const prev = value
    setValue(next)
    setError(null)
    // Empty input clears the date (and its reminder); otherwise send a real ISO instant.
    const interviewAt = next ? new Date(next).toISOString() : null
    startTransition(async () => {
      try {
        await patchJob(jobId, { interviewAt })
        router.refresh()
      } catch (e) {
        setValue(prev)
        setError(e instanceof Error ? e.message : "Couldn't save the interview date.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="datetime-local"
        value={value}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        aria-label="Interview date"
        className={cn(
          "w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] text-foreground transition-colors",
          "hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-70",
        )}
      />

      {error ? (
        <p className="flex items-start gap-1.5 text-[13px] text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : value ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          We&apos;ll remind you 24h before.
        </p>
      ) : null}
    </div>
  )
}
