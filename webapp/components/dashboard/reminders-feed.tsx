"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Bell,
  BellOff,
  Briefcase,
  ChevronRight,
  Clock,
  Plus,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { dueBucket, dueDisplay, isOverdue, type DueBucket } from "@/lib/dates"
import {
  createStandaloneReminder,
  deleteReminder as deleteReminderRequest,
  toggleReminder,
} from "@/lib/reminders/client"
import { isComplete, isOpen } from "@/lib/reminders/status"
import { buildDue, type ChipKey } from "@/lib/reminders/schedule"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ReminderCheckbox } from "@/components/dashboard/reminder-checkbox"
import { ReminderSchedule } from "@/components/dashboard/reminder-schedule"
import type { Reminder, ReminderType } from "@/lib/reminders/types"

// The feed is grouped by *urgency*, not by when a reminder was made — the only question the list
// answers is "what's due, and how soon?". Each bucket owns a header tone, and the per-row due chip
// borrows the same hue so a glance down the right edge ranks the whole list by pressure. Color is
// spent only where it means "act": red for overdue, amber for today; everything calmer reads quiet.
const DUE_GROUPS: {
  key: DueBucket
  label: string
  /** Header accent — only the two pressing buckets carry color. */
  header: string
}[] = [
  { key: "overdue", label: "Overdue", header: "text-destructive" },
  { key: "today", label: "Today", header: "text-amber-700 dark:text-amber-400" },
  { key: "tomorrow", label: "Tomorrow", header: "text-muted-foreground/70" },
  { key: "thisWeek", label: "This week", header: "text-muted-foreground/70" },
  { key: "later", label: "Later", header: "text-muted-foreground/70" },
  // No "unscheduled" bucket: a dateless row is a plain to-do (it lives on its job's To-do panel),
  // and the feed is fed only dated reminders (see listReminders). The composer below enforces the
  // same rule by requiring a date before save.
]

const FILTERS: { label: string; value: ReminderType | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Auto", value: "system" },
  { label: "You", value: "user" },
]

// Sort inside a bucket: open before done, soonest due first, then oldest-created as the tiebreak
// (newest-first for the dateless "No date" bucket, which reads like a capture inbox).
function byUrgency(a: Reminder, b: Reminder): number {
  const aComplete = isComplete(a)
  const bComplete = isComplete(b)
  if (aComplete !== bComplete) return aComplete ? 1 : -1
  const at = a.dueAt ? new Date(a.dueAt).getTime() : null
  const bt = b.dueAt ? new Date(b.dueAt).getTime() : null
  if (at !== null && bt !== null && at !== bt) return at - bt
  const ac = new Date(a.createdAt).getTime()
  const bc = new Date(b.createdAt).getTime()
  return at === null && bt === null ? bc - ac : ac - bc
}

// The reminders page: a time-grouped action feed. Reminders are "fetched" on the server and passed
// in; this owns a working copy so completing, dismissing, and adding all update instantly. Recency
// is the structure (group subheaders), type is the color, and every row carries one primary action
// (the checkbox) plus a quiet dismiss on hover.
export function RemindersFeed({ reminders: initial }: { reminders: Reminder[] }) {
  const router = useRouter()
  const [reminders, setReminders] = useState(initial)
  const [filter, setFilter] = useState<ReminderType | "ALL">("ALL")
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState("")
  const [chip, setChip] = useState<ChipKey | null>(null)
  const [customDate, setCustomDate] = useState("")
  const [time, setTime] = useState("")

  // Re-sync to the server's truth whenever fresh props arrive (after any router.refresh()) —
  // React's recommended "adjust state during render" pattern (no effect, no cascading renders).
  const [syncedFrom, setSyncedFrom] = useState(initial)
  if (syncedFrom !== initial) {
    setSyncedFrom(initial)
    setReminders(initial)
  }

  const [showCompleted, setShowCompleted] = useState(false)

  const visible = useMemo(
    () => reminders.filter((r) => filter === "ALL" || r.type === filter),
    [reminders, filter],
  )

  // A completed reminder is no longer "due" in any urgency sense — ticking it off is the whole point
  // of the row. So the urgency buckets carry only *open* reminders (this is why checking an overdue
  // item makes it leave the Overdue group), and everything done collapses into its own section below.
  const groups = useMemo(
    () =>
      DUE_GROUPS.map((g) => ({
        ...g,
        items: visible
          .filter((r) => isOpen(r) && dueBucket(r.dueAt, r.hasTime) === g.key)
          .sort(byUrgency),
      })).filter((g) => g.items.length > 0),
    [visible],
  )

  // Done reminders, most-recently-due first — a quiet archive at the foot of the feed, collapsed by
  // default so the list stays about what's left to do.
  const completed = useMemo(
    () =>
      visible
        .filter(isComplete)
        .sort((a, b) => {
          const at = a.dueAt ? new Date(a.dueAt).getTime() : 0
          const bt = b.dueAt ? new Date(b.dueAt).getTime() : 0
          return bt - at
        }),
    [visible],
  )

  // Overdue reminders are still "open" (unticked), but the summary partitions them out so a
  // single overdue reminder reads as "1 overdue" — not double-counted as "1 open · 1 overdue".
  const overdueCount = reminders.filter(
    (r) => isOpen(r) && r.dueAt !== undefined && isOverdue(r.dueAt, r.hasTime),
  ).length
  const openCount = reminders.filter(isOpen).length - overdueCount
  const pendingCount = openCount + overdueCount

  // All three mutations update locally for instant feedback, then persist and `router.refresh()`
  // to reconcile with the server. On failure they revert the optimistic change.
  async function toggle(id: string) {
    const next = !reminders.find((r) => r.id === id)?.done
    setReminders((cur) => cur.map((r) => (r.id === id ? { ...r, done: next } : r)))
    try {
      await toggleReminder(id, next)
      router.refresh()
    } catch {
      setReminders((cur) => cur.map((r) => (r.id === id ? { ...r, done: !next } : r)))
    }
  }

  async function dismiss(id: string) {
    const prev = reminders
    setReminders((cur) => cur.filter((r) => r.id !== id))
    try {
      await deleteReminderRequest(id)
      router.refresh()
    } catch {
      setReminders(prev)
    }
  }

  // Reset the composer back to empty and collapse it — shared by Cancel and a successful add.
  function closeComposer() {
    setComposing(false)
    setDraft("")
    setChip(null)
    setCustomDate("")
    setTime("")
  }

  // A reminder on this page must be dated — a dateless row would be a plain to-do and never show
  // here. True exactly when buildDue will resolve a date (a chip is picked, and if it's "custom",
  // a date is entered). Gates the composer's save so we never persist an invisible dateless row.
  const hasDate = chip !== null && (chip !== "custom" || customDate.trim() !== "")

  async function addReminder() {
    const title = draft.trim()
    if (!title || !hasDate) return
    const due = buildDue(chip, customDate, time)
    const optimistic: Reminder = {
      id: `tmp-${Date.now()}`,
      title,
      type: "user",
      createdAt: new Date().toISOString(),
      done: false,
      ...due,
    }
    setReminders((cur) => [optimistic, ...cur])
    closeComposer()
    try {
      await createStandaloneReminder({ title, ...due })
      router.refresh()
    } catch {
      setReminders((cur) => cur.filter((r) => r.id !== optimistic.id))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reminders</h1>
          <p className="text-sm text-muted-foreground">
            {pendingCount === 0 ? (
              "You're all caught up."
            ) : (
              <>
                {openCount > 0 && (
                  <>
                    {openCount} open {openCount === 1 ? "reminder" : "reminders"}
                  </>
                )}
                {openCount > 0 && overdueCount > 0 && " · "}
                {overdueCount > 0 && (
                  <span className="font-medium text-destructive">{overdueCount} overdue</span>
                )}
              </>
            )}
          </p>
        </div>

        <Button
          size="sm"
          className="gap-1.5 self-start sm:self-auto"
          onClick={() => (composing ? closeComposer() : setComposing(true))}
        >
          <Plus className="size-4" strokeWidth={2.5} />
          New reminder
        </Button>
      </header>

      {/* Composer — a manual ("You") reminder. A prominent title field leads; the same
          quick-pick chips, custom date, and optional time as the per-job popover schedule when
          it's due. */}
      {composing && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addReminder()
              if (e.key === "Escape") closeComposer()
            }}
            maxLength={300} // mirrors createReminderSchema's cap (lib/validations/reminder.ts)
            placeholder="Remind me to…"
            className="h-11 rounded-lg px-4 text-[15px]"
          />

          <ReminderSchedule
            chip={chip}
            onChipChange={setChip}
            customDate={customDate}
            onCustomDateChange={setCustomDate}
            time={time}
            onTimeChange={setTime}
          />

          <div className="flex items-center justify-end gap-2">
            {draft.trim() && !hasDate && (
              <span className="mr-auto text-[12px] text-muted-foreground">
                Pick when to be reminded.
              </span>
            )}
            <Button size="sm" variant="ghost" onClick={closeComposer}>
              Cancel
            </Button>
            <Button size="sm" onClick={addReminder} disabled={!draft.trim() || !hasDate}>
              Add reminder
            </Button>
          </div>
        </div>
      )}

      {/* Type filter — quiet segmented control, matching the saved-jobs feed. */}
      <div className="flex w-fit gap-1 rounded-md border border-border bg-card p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={cn(
              "cursor-pointer rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
              filter === f.value
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 && completed.length === 0 ? (
        <EmptyState filtered={filter !== "ALL"} />
      ) : (
        <Card className="overflow-hidden rounded-xl border-border/70 bg-sidebar py-0">
          {groups.map((group, i) => (
            <section key={group.key}>
              <div
                className={cn(
                  "flex items-center gap-2 px-4 pb-2 pt-4",
                  i > 0 && "border-t border-border/60",
                )}
              >
                <h2
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider",
                    group.header,
                  )}
                >
                  {group.label}
                </h2>
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground/45">
                  {group.items.length}
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {group.items.map((r) => (
                  <ReminderRow
                    key={r.id}
                    reminder={r}
                    onToggle={() => toggle(r.id)}
                    onDismiss={() => dismiss(r.id)}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Completed — a collapsible archive below the live buckets. A toggle, not a urgency
              header: its count is the proof that ticking an item off moved it here, out of Overdue. */}
          {completed.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                aria-expanded={showCompleted}
                className={cn(
                  "flex w-full items-center gap-1.5 px-4 pb-2 pt-4 text-left transition-colors hover:bg-background",
                  groups.length > 0 && "border-t border-border/60",
                )}
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 text-muted-foreground/50 transition-transform",
                    showCompleted && "rotate-90",
                  )}
                />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Completed
                </h2>
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground/45">
                  {completed.length}
                </span>
              </button>
              {showCompleted && (
                <div className="divide-y divide-border/50">
                  {completed.map((r) => (
                    <ReminderRow
                      key={r.id}
                      reminder={r}
                      onToggle={() => toggle(r.id)}
                      onDismiss={() => dismiss(r.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </Card>
      )}
    </div>
  )
}

function ReminderRow({
  reminder,
  onToggle,
  onDismiss,
}: {
  reminder: Reminder
  onToggle: () => void
  onDismiss: () => void
}) {
  const { title, job, type, createdAt, dueAt, hasTime } = reminder
  const complete = isComplete(reminder)

  // Created-at is the least useful fact here, so it lives in a hover tooltip instead of taking
  // a column — preserved, never competing with the title or the due time.
  const added = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt))

  return (
    <div
      title={`Added ${added}`}
      className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-background"
    >
      <ReminderCheckbox checked={complete} onToggle={onToggle} title={title} />

      {/* Content — the reminder itself leads (primary), the posting it's tied to trails (secondary). */}
      <div className="min-w-0 flex-1 pt-px">
        <div className="flex min-w-0 items-start gap-1.5">
          {type === "system" && (
            <>
              <Sparkles
                aria-hidden
                className={cn(
                  "mt-0.5 size-3.5 shrink-0 text-accent-foreground/70",
                  complete && "opacity-40",
                )}
              />
              <span className="sr-only">Auto reminder: </span>
            </>
          )}
          <span
            className={cn(
              "min-w-0 break-words text-[15px] font-medium leading-snug text-foreground",
              complete && "font-normal text-muted-foreground line-through",
            )}
          >
            {title}
          </span>
        </div>

        {job && (
          <Link
            href={`/dashboard/jobs/${job.id}`}
            className="mt-1 inline-flex max-w-full items-center gap-1.5 text-[13px] transition-colors"
          >
            <Briefcase className="size-3.5 shrink-0 text-muted-foreground/50" />
            <span className="truncate text-muted-foreground">
              <span className="font-medium text-foreground/80">{job.company}</span>
              {" · "}
              {job.title}
            </span>
          </Link>
        )}
      </div>

      {/* Due time — the right-edge urgency column, color-coded for pressing buckets. */}
      <div className="flex shrink-0 items-center gap-1 pl-2 pt-px">
        <DueChip dueAt={dueAt} hasTime={hasTime} complete={complete} />
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss reminder"
          className="grid size-7 place-items-center rounded-md text-muted-foreground/50 opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

// The single most scannable element on the row. Overdue and Today are filled, hued, icon-led so
// the eye lands on them first; nearer-but-calm buckets stay as quiet medium text; completed
// reminders drop all alarm. A reminder with no due date shows nothing here — its bucket says it.
function DueChip({
  dueAt,
  hasTime,
  complete,
}: {
  dueAt?: string
  hasTime?: boolean
  complete: boolean
}) {
  if (!dueAt) return null
  const label = dueDisplay(dueAt, hasTime)

  if (complete) {
    return (
      <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground/70">
        {label}
      </span>
    )
  }

  const bucket = dueBucket(dueAt, hasTime)

  if (bucket === "overdue") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-[13px] font-medium tabular-nums text-destructive">
        <TriangleAlert className="size-3.5 shrink-0" />
        {label}
      </span>
    )
  }

  if (bucket === "today") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/15 px-2 py-0.5 text-[13px] font-medium tabular-nums text-amber-700 dark:text-amber-400">
        <Clock className="size-3.5 shrink-0" />
        {label}
      </span>
    )
  }

  return (
    <span className="whitespace-nowrap px-1 text-[13px] font-medium tabular-nums text-foreground/70">
      {label}
    </span>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  const Icon = filtered ? BellOff : Bell
  return (
    <Card className="flex flex-col items-center gap-2 border-dashed px-6 py-16 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="mt-1 font-medium">{filtered ? "Nothing here" : "No reminders"}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "No reminders of this type right now. Try a different filter."
          : "Deadlines and follow-ups will show up here. Set one yourself, or let us watch your saved postings."}
      </p>
    </Card>
  )
}
