"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, BellPlus, Plus, TriangleAlert, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { dueDisplay, dueLabel, isOverdue } from "@/lib/dates"
import {
  createReminder,
  deleteReminder,
  setReminderDue,
  toggleReminder,
} from "@/lib/reminders/client"
import { isComplete } from "@/lib/reminders/status"
import type { Reminder } from "@/lib/reminders/types"
import { ReminderCheckbox } from "@/components/dashboard/reminder-checkbox"
import { SchedulePopover, type ScheduledDue } from "./reminder-popover"

/**
 * The per-job To-do card body (the panel wraps it in a Card + header). A single list holds both
 * plain to-dos and reminders — the only difference is a due date. Adding is one keystroke: type a
 * task and press Enter. To make it a reminder instead, click the bell to pick a date; a dated row
 * shows a bell + due label (the visual "this is a reminder" cue) and surfaces on the global
 * Reminders page. An existing to-do can be converted the same way via the bell that appears on its
 * row. Mutations update locally for instant feedback, then `router.refresh()` reconciles with the
 * server — which also keeps the list current when a reminder is added from the header's "Remind
 * me" button.
 */
export function TodoCard({
  jobId,
  reminders,
}: {
  jobId: string
  reminders: Reminder[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(reminders)
  const [draft, setDraft] = useState("")

  // Re-sync to the server's truth whenever fresh props arrive (after any router.refresh()) —
  // React's recommended "adjust state during render" pattern, so a reminder added from the
  // header's "Remind me" button shows up here without clobbering an in-flight optimistic edit.
  const [syncedFrom, setSyncedFrom] = useState(reminders)
  if (syncedFrom !== reminders) {
    setSyncedFrom(reminders)
    setItems(reminders)
  }

  // Add a row. `due` absent → a plain to-do; present → a dated reminder. Shared by the Enter-key
  // quick-add and the bell's schedule popover.
  async function add(title: string, due?: ScheduledDue) {
    const clean = title.trim()
    if (!clean) return
    const optimistic: Reminder = {
      id: `tmp-${Date.now()}`,
      title: clean,
      type: "user",
      createdAt: new Date().toISOString(),
      done: false,
      ...(due ? { dueAt: due.dueAt, hasTime: due.hasTime } : {}),
    }
    setItems((cur) => [...cur, optimistic])
    setDraft("")
    try {
      await createReminder(jobId, { title: clean, ...(due ?? {}) })
      router.refresh()
    } catch (e) {
      setItems((cur) => cur.filter((r) => r.id !== optimistic.id))
      throw e // let the bell popover surface the error and stay open
    }
  }

  async function handleToggle(id: string, done: boolean) {
    setItems((cur) => cur.map((r) => (r.id === id ? { ...r, done } : r)))
    try {
      await toggleReminder(id, done)
      router.refresh()
    } catch {
      setItems((cur) => cur.map((r) => (r.id === id ? { ...r, done: !done } : r)))
    }
  }

  // Convert an existing to-do into a reminder by attaching a due date (the scheduler kicks in
  // server-side off the PATCH). Optimistic; reverts on failure so the popover can show the error.
  async function handleConvert(id: string, due: ScheduledDue) {
    const prev = items
    setItems((cur) =>
      cur.map((r) => (r.id === id ? { ...r, dueAt: due.dueAt, hasTime: due.hasTime } : r)),
    )
    try {
      await setReminderDue(id, due)
      router.refresh()
    } catch (e) {
      setItems(prev)
      throw e
    }
  }

  async function handleDismiss(id: string) {
    const prev = items
    setItems((cur) => cur.filter((r) => r.id !== id))
    try {
      await deleteReminder(id)
      router.refresh()
    } catch {
      setItems(prev)
    }
  }

  return (
    <div className="flex flex-col">
      {items.length === 0 ? (
        <p className="py-0.5 text-[13px] text-muted-foreground/70">
          No tasks yet — add one to stay on track.
        </p>
      ) : (
        <ul className="-mt-1 flex flex-col">
          {items.map((r) => (
            <TodoRow
              key={r.id}
              item={r}
              onToggle={() => handleToggle(r.id, !r.done)}
              onConvert={(due) => handleConvert(r.id, due)}
              onDismiss={() => handleDismiss(r.id)}
            />
          ))}
        </ul>
      )}

      {/* Inline composer — the fast path. Type + Enter = a plain to-do; the bell turns it into a
          dated reminder. Sits where a list row would, so it reads as "add another". */}
      <div className="mt-2 flex items-center gap-2.5">
        <Plus className="size-4 shrink-0 text-muted-foreground/45" aria-hidden />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void add(draft)
            }
          }}
          maxLength={300} // mirrors createReminderSchema's cap (lib/validations/reminder.ts)
          placeholder="Add a task…"
          aria-label="Add a task"
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-snug text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        <SchedulePopover
          align="end"
          onPick={(due) => add(draft, due)}
          renderTrigger={({ open }) => (
            <button
              type="button"
              disabled={draft.trim().length === 0}
              aria-label="Remind me — pick a date"
              title="Remind me — pick a date"
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition hover:bg-muted hover:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
                open && "bg-muted text-foreground",
              )}
            >
              <Bell className="size-3.5" />
            </button>
          )}
        />
      </div>
    </div>
  )
}

function TodoRow({
  item,
  onToggle,
  onConvert,
  onDismiss,
}: {
  item: Reminder
  onToggle: () => void
  onConvert: (due: ScheduledDue) => Promise<void>
  onDismiss: () => void
}) {
  const { title, dueAt, hasTime } = item
  const complete = isComplete(item)
  const overdue = !complete && dueAt !== undefined && isOverdue(dueAt, hasTime)

  return (
    <li className="group flex items-start gap-2.5 border-b border-border/60 py-2 last:border-0">
      <ReminderCheckbox checked={complete} onToggle={onToggle} title={title} />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[14px] leading-snug text-foreground break-words",
            complete && "text-muted-foreground line-through",
          )}
        >
          {title}
        </p>
        {dueAt &&
          (overdue ? (
            // Overdue gets the same filled, icon-led destructive pill as the global reminders feed,
            // so a missed follow-up reads as "act now" here too — not a faint line of red text.
            <span className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-[11.5px] font-medium tabular-nums text-destructive">
              <TriangleAlert className="size-3 shrink-0" />
              {dueDisplay(dueAt, hasTime)}
            </span>
          ) : (
            <span
              className={cn(
                "mt-0.5 inline-flex items-center gap-1 text-[11.5px]",
                complete ? "text-muted-foreground/60" : "text-muted-foreground",
              )}
            >
              <Bell className="size-3" />
              {dueLabel(dueAt, hasTime)}
            </span>
          ))}
      </div>

      {/* A plain to-do gets a hover "remind me" affordance to attach a date (convert → reminder).
          Dated rows already show their bell + due label, so they skip it. */}
      {!dueAt && !complete && (
        <SchedulePopover
          align="end"
          onPick={onConvert}
          renderTrigger={({ open }) => (
            <button
              type="button"
              aria-label={`Remind me about "${title}"`}
              title="Remind me — pick a date"
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/50 opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100",
                open && "bg-muted text-foreground opacity-100",
              )}
            >
              <BellPlus className="size-3.5" />
            </button>
          )}
        />
      )}

      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Delete "${title}"`}
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/50 opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </li>
  )
}
