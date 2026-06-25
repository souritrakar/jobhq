"use client"

import { useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Menu } from "./menu"

/** The fields a saved reminder carries; `dueAt` is an ISO string when a date was picked. */
export type ReminderDraft = { title: string; dueAt?: string; hasTime?: boolean }

// Quick-pick chips. Each maps to a whole number of days from today; "custom" reveals a date input.
const CHIPS = [
  { key: "tomorrow", label: "Tomorrow", days: 1 },
  { key: "in3", label: "In 3 days", days: 3 },
  { key: "nextweek", label: "Next week", days: 7 },
  { key: "custom", label: "Custom", days: null },
] as const

type ChipKey = (typeof CHIPS)[number]["key"]

function startOfDayPlus(days: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

// Resolve the selected chip + optional custom date + optional time into a due timestamp.
// Date-only reminders default to 9am local so day-bucketing stays stable away from midnight.
function buildDue(
  chip: ChipKey | null,
  customDate: string,
  time: string,
): { dueAt?: string; hasTime?: boolean } {
  let base: Date | null = null
  const picked = CHIPS.find((c) => c.key === chip)
  if (picked && picked.days !== null) base = startOfDayPlus(picked.days)
  else if (chip === "custom" && customDate) {
    const [y, m, d] = customDate.split("-").map(Number)
    base = new Date(y, m - 1, d)
  }
  if (!base) return {} // no due date — allowed
  const hasTime = Boolean(time)
  if (hasTime) {
    const [h, min] = time.split(":").map(Number)
    base.setHours(h, min, 0, 0)
  } else {
    base.setHours(9, 0, 0, 0)
  }
  return { dueAt: base.toISOString(), hasTime }
}

/**
 * The shared "add a reminder" popover, opened from both the rail's "+ Add reminder" row and the
 * header's "Remind me" button. Built on the `Menu` primitive (anchored panel + outside-click /
 * Escape dismissal). Deliberately lightweight: a prefilled text field, relative quick-pick date
 * chips, an optional time, and Save. The form remounts fresh each open (Menu only renders its
 * children while open), so there's no reset to manage.
 */
export function ReminderPopover({
  renderTrigger,
  company,
  onSubmit,
  align = "end",
}: {
  renderTrigger: (api: { open: boolean; toggle: () => void }) => ReactNode
  company?: string
  onSubmit: (draft: ReminderDraft) => Promise<void>
  align?: "start" | "end"
}) {
  return (
    <Menu renderTrigger={renderTrigger} align={align} panelClassName="w-72 p-3">
      {({ close }) => <PopoverForm company={company} onSubmit={onSubmit} onDone={close} />}
    </Menu>
  )
}

function PopoverForm({
  company,
  onSubmit,
  onDone,
}: {
  company?: string
  onSubmit: (draft: ReminderDraft) => Promise<void>
  onDone: () => void
}) {
  const [title, setTitle] = useState(company ? `Follow up with ${company}` : "Follow up")
  const [chip, setChip] = useState<ChipKey | null>(null)
  const [customDate, setCustomDate] = useState("")
  const [time, setTime] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = title.trim().length > 0 && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ title: title.trim(), ...buildDue(chip, customDate, time) })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the reminder")
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            void save()
          }
        }}
        placeholder="Remind me to…"
        aria-label="Reminder text"
      />

      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={chip === c.key}
            onClick={() => setChip((cur) => (cur === c.key ? null : c.key))}
            className={cn(
              "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              chip === c.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {chip === "custom" && (
        <Input
          type="date"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          aria-label="Custom date"
          className="h-8 text-[13px]"
        />
      )}

      <label className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
        Time
        <Input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Reminder time (optional)"
          className="h-8 w-28 text-[13px]"
        />
      </label>

      {error && <p className="text-[11.5px] text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="xs" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button size="xs" onClick={() => void save()} disabled={!canSave}>
          {saving && <Loader2 className="size-3 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  )
}
