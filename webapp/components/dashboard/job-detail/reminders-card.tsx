"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { daysUntil, dueLabel } from "@/lib/dates"
import {
  createReminder,
  deleteReminder,
  toggleReminder,
} from "@/lib/reminders/client"
import type { Reminder } from "@/lib/reminders/types"
import { ReminderCheckbox } from "@/components/dashboard/reminder-checkbox"
import { ReminderPopover, type ReminderDraft } from "./reminder-popover"

/**
 * The per-job Reminders card body (the rail wraps it in a Card + header). Lists this job's
 * reminders, each a row with a complete checkbox, the text, and a due label; ends with a quiet
 * empty state or a "+ Add reminder" row that opens the shared popover. Mutations update locally
 * for instant feedback, then `router.refresh()` reconciles with the server — which also keeps the
 * list current when a reminder is added from the header's "Remind me" button.
 */
export function RemindersCard({
  jobId,
  company,
  reminders,
}: {
  jobId: string
  company?: string
  reminders: Reminder[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(reminders)

  // Re-sync to the server's truth whenever fresh props arrive (after any router.refresh()) —
  // React's recommended "adjust state during render" pattern, so a reminder added from the
  // header's "Remind me" button shows up here without clobbering an in-flight optimistic edit.
  const [syncedFrom, setSyncedFrom] = useState(reminders)
  if (syncedFrom !== reminders) {
    setSyncedFrom(reminders)
    setItems(reminders)
  }

  async function handleCreate(draft: ReminderDraft) {
    const optimistic: Reminder = {
      id: `tmp-${Date.now()}`,
      title: draft.title,
      type: "user",
      createdAt: new Date().toISOString(),
      done: false,
      dueAt: draft.dueAt,
      hasTime: draft.hasTime,
    }
    setItems((cur) => [...cur, optimistic])
    try {
      await createReminder(jobId, draft)
      router.refresh()
    } catch (e) {
      setItems((cur) => cur.filter((r) => r.id !== optimistic.id))
      throw e // let the popover surface the error and stay open
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
          No reminders yet — add one to follow up.
        </p>
      ) : (
        <ul className="-mt-1 flex flex-col">
          {items.map((r) => (
            <ReminderRow
              key={r.id}
              reminder={r}
              onToggle={() => handleToggle(r.id, !r.done)}
              onDismiss={() => handleDismiss(r.id)}
            />
          ))}
        </ul>
      )}

      <ReminderPopover
        company={company}
        onSubmit={handleCreate}
        align="start"
        renderTrigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className={cn(
              "mt-2 inline-flex w-fit items-center gap-1.5 rounded-md text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground",
              open && "text-foreground",
            )}
          >
            <Plus className="size-3.5" />
            Add reminder
          </button>
        )}
      />
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
  const { title, done, dueAt, hasTime } = reminder
  const overdue = !done && dueAt !== undefined && daysUntil(dueAt) < 0

  return (
    <li className="group flex items-start gap-2.5 border-b border-border/60 py-2 last:border-0">
      <ReminderCheckbox checked={done} onToggle={onToggle} title={title} />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[14px] leading-snug text-foreground",
            done && "text-muted-foreground line-through",
          )}
        >
          {title}
        </p>
        {dueAt && (
          <span
            className={cn(
              "mt-0.5 inline-flex items-center gap-1 text-[11.5px]",
              overdue ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <Bell className="size-3" />
            {overdue ? "Overdue · " : ""}
            {dueLabel(dueAt, hasTime)}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Delete reminder "${title}"`}
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/50 opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </li>
  )
}
