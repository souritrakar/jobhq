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

// Time-only, for the day-of label ("Today, 2:00 PM") where the date is implied.
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })

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
 * Set or clear this job's interview date. The popover holds a *draft*: picking a day or time only
 * updates local state — nothing is saved until the user hits Done (or Clear). That single commit
 * is what keeps a half-finished pick (a default 9:00, yesterday's fallback time) from ever being
 * persisted, and its reminder mis-scheduled, before the user is finished.
 *
 * Persisting (PATCH `interviewAt`) keeps a single SYSTEM "interview" reminder in sync server-side
 * (due = the interview, delivered 24h before), so a successful save is followed by router.refresh()
 * to pull the fresh reminder into the To-do card and the feed.
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
  // `committed` is the saved interview (drives the trigger label + status below); `draft` is the
  // in-popover working value the pickers edit. They diverge only while the popover is open.
  const [committed, setCommitted] = useState<string>(toLocalInputValue(interviewAt))
  const [draft, setDraft] = useState<string>(committed)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const { date: draftDate, time: draftTime } = splitLocal(draft)

  // Commonsense guard: an interview can't be scheduled in the past. Bar earlier calendar days, and
  // when the chosen day is today, floor the time picker at "now" so a slot that already passed can't
  // be picked. Mirrors the reminder composer's rule so both time controls behave the same way.
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const nowHm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const isToday = (d: Date) => d.getTime() === today.getTime()
  const minTime = draftDate && isToday(draftDate) ? nowHm : undefined

  // Compose a calendar day + "HH:mm" time into the draft (NOT saved yet). Picking a date with no
  // time yet defaults to 9:00 AM — but never a moment already gone: on today, start from "now" if
  // 9:00 AM has passed. So a single tap always yields a valid, future draft slot.
  function editDraft(nextDate: Date | undefined, nextTime: string) {
    if (!nextDate) return
    const fallback = isToday(nextDate) && nowHm > "09:00" ? nowHm : "09:00"
    setDraft(`${toYmd(nextDate)}T${nextTime || fallback}`)
  }

  // Persist a value (the committed draft, or "" to clear). Optimistic: reflect it immediately, revert
  // on failure. Empty clears the date (and its reminder); otherwise send a real ISO instant.
  function persist(next: string) {
    const prev = committed
    setCommitted(next)
    setError(null)
    const interviewAtIso = next ? new Date(next).toISOString() : null
    startTransition(async () => {
      try {
        await patchJob(jobId, { interviewAt: interviewAtIso })
        router.refresh()
      } catch (e) {
        setCommitted(prev)
        setError(e instanceof Error ? e.message : "Couldn't save the interview date.")
      }
    })
  }

  // Open resets the draft to the saved value, so dismissing without Done discards edits cleanly.
  function onOpenChange(next: boolean) {
    if (next) setDraft(committed)
    setOpen(next)
  }

  function done() {
    if (draft !== committed) persist(draft)
    setOpen(false)
  }

  function clear() {
    persist("")
    setDraft("")
    setOpen(false)
  }

  // --- Derived state of the *committed* interview: what the label + status pill reflect. ---
  const { date: committedDate } = splitLocal(committed)
  const display = committed ? displayFmt.format(new Date(committed)) : null
  // `committed` is a local datetime-local string (always time-bearing), so `isOverdue(committed,
  // true)` compares it against the wall clock — the same time-aware check the reminders feed uses.
  const interviewPast = committed !== "" && isOverdue(committed, true)
  const isInterviewDay = committedDate ? isToday(committedDate) : false
  // The two urgency states the card escalates through, both still ahead of the interview:
  //   dayOf     — it's happening today: the loud, high-visibility state.
  //   needsLook — it has passed unhandled: amber, "take a look".
  const dayOf = isInterviewDay && !interviewPast && !reminderDone
  const needsLook = interviewPast && !reminderDone

  // The trigger reads "Today, 2:00 PM" on the day itself (the date is obvious and the word "Today"
  // does the urgency work), otherwise the full "Fri, Jul 3, 2:00 PM".
  const triggerLabel = !committed
    ? "Set interview date"
    : dayOf
      ? `Today, ${timeFmt.format(new Date(committed))}`
      : display

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          disabled={pending}
          aria-label="Interview date"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border px-3 text-sm transition-colors",
            // The day-of state gets more presence: a touch more height and a filled tint.
            dayOf ? "bg-status-interviewing/40 py-4" : "bg-background py-3.5",
            display ? "justify-start" : "justify-center",
            "hover:border-input hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-70 data-[popup-open]:border-ring",
            dayOf
              ? "border-status-interviewing-foreground/50 hover:bg-status-interviewing/50"
              : needsLook
                ? "border-status-interviewing-foreground/40"
                : "border-border",
          )}
        >
          <CalendarClock
            className={cn(
              "shrink-0",
              dayOf ? "size-5" : "size-[18px]",
              dayOf || needsLook
                ? "text-status-interviewing-foreground"
                : "text-muted-foreground",
            )}
          />
          <span
            className={cn(
              "truncate",
              !display && "text-muted-foreground",
              display && (dayOf ? "font-semibold text-foreground" : "font-medium text-foreground"),
            )}
          >
            {triggerLabel}
          </span>
          {dayOf && (
            <span className="ml-auto shrink-0 rounded-full bg-status-interviewing-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-background">
              Today
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-border">
            <Calendar
              mode="single"
              autoFocus
              selected={draftDate}
              defaultMonth={draftDate}
              disabled={{ before: today }}
              onSelect={(next) => editDraft(next, draftTime)}
            />
            <div className="flex w-full flex-col gap-2 border-t border-border p-3 sm:w-40 sm:border-t-0">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Time
              </span>
              <TimeColumns
                value={draftTime}
                minTime={minTime}
                onChange={(t) => editDraft(draftDate ?? new Date(), t)}
              />
            </div>
          </div>
          {draft && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3.5" />
                Clear
              </button>
              <button
                type="button"
                onClick={done}
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
      ) : committed ? (
        reminderDone ? (
          <StatusPill tone="success" icon={CheckCircle2}>
            Reminder done
          </StatusPill>
        ) : interviewPast ? (
          <StatusPill tone="attention" icon={CalendarClock}>
            Interview has passed
          </StatusPill>
        ) : dayOf ? (
          // Day of: no "24h before" line — that heads-up has already gone out. This is the urgent,
          // present-tense state instead.
          <StatusPill tone="today" icon={BellRing}>
            Interview today · {timeFmt.format(new Date(committed))}
          </StatusPill>
        ) : reminderDeliveredAt ? (
          <StatusPill tone="success" icon={BellRing}>
            We reminded you · {savedLabel(reminderDeliveredAt)}
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

// Color-coded interview status — each tone maps to a clear meaning: green = handled, interviewing =
// imminent/day-of (loudest), amber = needs attention (passed), quiet = scheduled, red = error. The
// day-of tone is the only one set bold + a hair larger, so urgency reads before the words do.
const PILL_TONE = {
  today: "bg-status-interviewing text-status-interviewing-foreground text-[12.5px] font-semibold",
  success: "bg-fern-50 text-fern-700 text-[12px] font-medium",
  attention: "bg-status-interviewing/70 text-status-interviewing-foreground text-[12px] font-medium",
  upcoming: "bg-secondary text-muted-foreground text-[12px] font-medium",
  danger: "bg-destructive/10 text-destructive text-[12px] font-medium",
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
        "inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 leading-tight",
        PILL_TONE[tone],
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {children}
    </span>
  )
}
