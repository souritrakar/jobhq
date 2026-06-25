"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Bell,
  BellOff,
  Briefcase,
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
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ReminderCheckbox } from "@/components/dashboard/reminder-checkbox"
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
  { key: "unscheduled", label: "No date", header: "text-muted-foreground/70" },
]

const FILTERS: { label: string; value: ReminderType | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Auto", value: "system" },
  { label: "You", value: "user" },
]

// Sort inside a bucket: open before done, soonest due first, then oldest-created as the tiebreak
// (newest-first for the dateless "No date" bucket, which reads like a capture inbox).
function byUrgency(a: Reminder, b: Reminder): number {
  if (a.done !== b.done) return a.done ? 1 : -1
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

  // Re-sync to the server's truth whenever fresh props arrive (after any router.refresh()) —
  // React's recommended "adjust state during render" pattern (no effect, no cascading renders).
  const [syncedFrom, setSyncedFrom] = useState(initial)
  if (syncedFrom !== initial) {
    setSyncedFrom(initial)
    setReminders(initial)
  }

  const visible = useMemo(
    () => reminders.filter((r) => filter === "ALL" || r.type === filter),
    [reminders, filter],
  )

  const groups = useMemo(
    () =>
      DUE_GROUPS.map((g) => ({
        ...g,
        items: visible
          .filter((r) => dueBucket(r.dueAt, r.hasTime) === g.key)
          .sort(byUrgency),
      })).filter((g) => g.items.length > 0),
    [visible],
  )

  const openCount = reminders.filter((r) => !r.done).length
  const overdueCount = reminders.filter(
    (r) => !r.done && r.dueAt !== undefined && isOverdue(r.dueAt, r.hasTime),
  ).length

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

  async function addReminder() {
    const title = draft.trim()
    if (!title) return
    const optimistic: Reminder = {
      id: `tmp-${Date.now()}`,
      title,
      type: "user",
      createdAt: new Date().toISOString(),
      done: false,
    }
    setReminders((cur) => [optimistic, ...cur])
    setDraft("")
    setComposing(false)
    try {
      await createStandaloneReminder({ title })
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
            {openCount === 0 ? (
              "You're all caught up."
            ) : (
              <>
                {openCount} open {openCount === 1 ? "reminder" : "reminders"}
                {overdueCount > 0 ? (
                  <>
                    {" · "}
                    <span className="font-medium text-destructive">{overdueCount} overdue</span>
                  </>
                ) : (
                  " — nudges so nothing slips away."
                )}
              </>
            )}
          </p>
        </div>

        <Button size="sm" className="gap-1.5 self-start sm:self-auto" onClick={() => setComposing((v) => !v)}>
          <Plus className="size-4" strokeWidth={2.5} />
          New reminder
        </Button>
      </header>

      {/* Composer — a manual ("You") reminder, added to the top of Today. */}
      {composing && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
          <Bell className="ml-1 size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addReminder()
              if (e.key === "Escape") setComposing(false)
            }}
            placeholder="Remind me to…"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button size="sm" onClick={addReminder} disabled={!draft.trim()}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setComposing(false)}>
            Cancel
          </Button>
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

      {groups.length === 0 ? (
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
  const { title, done, job, type, createdAt, dueAt, hasTime } = reminder

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
      <ReminderCheckbox checked={done} onToggle={onToggle} title={title} />

      {/* Content — the reminder itself leads (primary), the posting it's tied to trails (secondary). */}
      <div className="min-w-0 flex-1 pt-px">
        <div className="flex min-w-0 items-center gap-1.5">
          {type === "system" && (
            <>
              <Sparkles
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 text-accent-foreground/70",
                  done && "opacity-40",
                )}
              />
              <span className="sr-only">Auto reminder: </span>
            </>
          )}
          <span
            className={cn(
              "truncate text-[15px] font-medium leading-snug text-foreground",
              done && "font-normal text-muted-foreground line-through",
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
        <DueChip dueAt={dueAt} hasTime={hasTime} done={done} />
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
  done,
}: {
  dueAt?: string
  hasTime?: boolean
  done: boolean
}) {
  if (!dueAt) return null
  const label = dueDisplay(dueAt, hasTime)

  if (done) {
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
