"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { isOverdue, savedLabel } from "@/lib/dates"
import { patchJob } from "@/lib/jobs/client"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TimeColumns } from "@/components/dashboard/time-picker"

const pad = (n: number) => String(n).padStart(2, "0")

// The interview instant, shown alphanumerically once set: "Tue, Jun 30, 2:00 PM".
const displayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

// Convert an ISO/Date string to the value our picker works in (YYYY-MM-DDTHH:mm) in the viewer's
// LOCAL time. Returns "" when there's no date, so the control renders empty.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Split a local "YYYY-MM-DDTHH:mm" value into its calendar day and "HH:mm" time for the two pickers.
function splitLocal(value: string): { date?: Date; time: string } {
  if (!value) return { time: "" }
  const [datePart, timePart = ""] = value.split("T")
  const [y, m, d] = datePart.split("-").map(Number)
  return { date: new Date(y, m - 1, d), time: timePart.slice(0, 5) }
}

/**
 * Set or clear this job's interview date. Persisting it (PATCH `interviewAt`) keeps a single
 * SYSTEM "interview" reminder in sync server-side, so a successful save is followed by
 * router.refresh() to pull the new reminder into the rail's Reminders card and the feed.
 */
export function InterviewDate({
  jobId,
  interviewAt,
  reminderDone = false,
  reminderDeliveredAt = null,
}: {
  jobId: string
  interviewAt: string | null
  /** The auto interview reminder has been manually ticked off. */
  reminderDone?: boolean
  /** ISO time the interview reminder fired (heads-up already sent), or null if not yet. */
  reminderDeliveredAt?: string | null
}) {
  const router = useRouter()
  const [value, setValue] = useState<string>(toLocalInputValue(interviewAt))
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const { date, time } = splitLocal(value)
  const display = value ? displayFmt.format(new Date(value)) : null

  // Compose a calendar day + "HH:mm" time into the local value and persist. Picking a date with no
  // time yet defaults to 9:00 AM so a single tap already yields a valid, saved interview slot.
  function commit(nextDate: Date | undefined, nextTime: string) {
    if (!nextDate) return
    save(`${toYmd(nextDate)}T${nextTime || "09:00"}`)
  }

  // Whether the chosen interview instant is already in the past. `value` is a local datetime-local
  // string (always time-bearing), so `isOverdue(value, true)` compares it against the wall clock —
  // the same time-aware check the reminders feed uses, keeping the impurity inside lib/dates.
  const interviewPast = value !== "" && isOverdue(value, true)

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

  // A past-but-unhandled interview is the one state that needs to grab attention — flag the input
  // itself amber so it reads as "needs a look" even before the status pill below.
  const needsAttention = interviewPast && !reminderDone

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={pending}
          aria-label="Interview date"
          className={cn(
            "flex w-full items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-[13px] transition-colors",
            "hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-70 data-[popup-open]:border-ring",
            needsAttention ? "border-status-interviewing-foreground/40" : "border-border",
          )}
        >
          <CalendarClock
            className={cn(
              "size-4 shrink-0",
              needsAttention ? "text-status-interviewing-foreground" : "text-muted-foreground",
            )}
          />
          <span className={cn("truncate", display ? "text-foreground" : "text-muted-foreground")}>
            {display ?? "Set interview date"}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-border">
            <Calendar
              mode="single"
              autoFocus
              selected={date}
              defaultMonth={date}
              onSelect={(next) => commit(next, time)}
            />
            <div className="flex w-full flex-col gap-2 border-t border-border p-3 sm:w-40 sm:border-t-0">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Time
              </span>
              <TimeColumns value={time} onChange={(t) => commit(date ?? new Date(), t)} />
            </div>
          </div>
          {value && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  save("")
                  setOpen(false)
                }}
                className="inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3.5" />
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2.5 py-1 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/10"
              >
                Done
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {error ? (
        <StatusPill tone="danger" icon={CircleAlert}>
          {error}
        </StatusPill>
      ) : value ? (
        reminderDone ? (
          <StatusPill tone="success" icon={CheckCircle2}>
            Reminder done
          </StatusPill>
        ) : reminderDeliveredAt ? (
          <StatusPill tone="success" icon={BellRing}>
            We reminded you · {savedLabel(reminderDeliveredAt)}
          </StatusPill>
        ) : interviewPast ? (
          <StatusPill tone="attention" icon={CalendarClock}>
            Interview has passed
          </StatusPill>
        ) : (
          <StatusPill tone="upcoming" icon={CalendarClock}>
            We&apos;ll remind you 24h before
          </StatusPill>
        )
      ) : null}
    </div>
  )
}

// Color-coded interview status — each tone maps to a clear meaning: green = handled, amber =
// needs attention (passed), quiet = scheduled, red = error. Reads at a glance in the sidebar.
const PILL_TONE = {
  success: "bg-fern-50 text-fern-700",
  attention: "bg-status-interviewing text-status-interviewing-foreground",
  upcoming: "bg-secondary text-muted-foreground",
  danger: "bg-destructive/10 text-destructive",
} as const

function StatusPill({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof PILL_TONE
  icon: typeof CheckCircle2
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium leading-tight",
        PILL_TONE[tone],
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {children}
    </span>
  )
}
