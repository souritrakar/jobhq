"use client"

import { useState, type ReactNode } from "react"
import { Popover } from "@base-ui/react/popover"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip } from "@/components/ui/tooltip"
import { ReminderSchedule } from "@/components/dashboard/reminder-schedule"
import { buildDue, type ChipKey } from "@/lib/reminders/schedule"

/** The fields a saved reminder carries; `dueAt` is an ISO string when a date was picked. */
export type ReminderDraft = { title: string; dueAt?: string; hasTime?: boolean }

/**
 * The shared "add a reminder" popover, opened from both the card's "+ Add reminder" row and the
 * header's "Remind me" button. Built on Base UI's Popover so the panel renders in a portal — it
 * floats above the page and is never clipped by an ancestor's `overflow-hidden` (the job page's
 * panel cards), and outside-click / Escape dismissal come for free. The caller renders the trigger
 * (a real focusable button) and receives `open` for styling; Base UI wires the click + aria.
 */
export function ReminderPopover({
  renderTrigger,
  company,
  onSubmit,
  align = "end",
  tooltip,
}: {
  renderTrigger: (api: { open: boolean }) => ReactNode
  company?: string
  onSubmit: (draft: ReminderDraft) => Promise<void>
  align?: "start" | "end"
  /** When set, an icon-only trigger gets this label on hover/focus (composed onto the trigger). */
  tooltip?: string
}) {
  const [open, setOpen] = useState(false)

  const trigger = <Popover.Trigger render={renderTrigger({ open }) as React.ReactElement} />

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {tooltip ? <Tooltip label={tooltip}>{trigger}</Tooltip> : trigger}
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align={align}
          sideOffset={6}
          className="z-50 outline-none"
        >
          <Popover.Popup
            className={cn(
              "w-72 rounded-md border border-border bg-background p-3 shadow-lg shadow-foreground/[0.08] outline-none",
              "transition-[opacity,transform] duration-150 ease-out",
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
              "motion-reduce:scale-100 motion-reduce:transition-none",
            )}
          >
            <PopoverForm
              company={company}
              onSubmit={onSubmit}
              onDone={() => setOpen(false)}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** A resolved due date — what the schedule popover hands back. Always dated (a reminder must fire). */
export type ScheduledDue = { dueAt: string; hasTime: boolean }

/**
 * A schedule-only popover — the same floating panel as ReminderPopover but with no title field,
 * just the "when?" controls. The title lives elsewhere (the To-do panel's inline input, or an
 * existing to-do row), so this only resolves a due date. Used to (a) add a dated reminder from the
 * inline composer's bell and (b) convert an existing to-do into a reminder. Save stays disabled
 * until a date is chosen, so it can never produce a dateless row.
 */
export function SchedulePopover({
  renderTrigger,
  onPick,
  align = "end",
}: {
  renderTrigger: (api: { open: boolean }) => ReactNode
  onPick: (due: ScheduledDue) => Promise<void>
  align?: "start" | "end"
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={renderTrigger({ open }) as React.ReactElement} />
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align={align}
          sideOffset={6}
          className="z-50 outline-none"
        >
          <Popover.Popup
            className={cn(
              "w-72 rounded-md border border-border bg-background p-3 shadow-lg shadow-foreground/[0.08] outline-none",
              "transition-[opacity,transform] duration-150 ease-out",
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
              "motion-reduce:scale-100 motion-reduce:transition-none",
            )}
          >
            <ScheduleForm onPick={onPick} onDone={() => setOpen(false)} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ScheduleForm({
  onPick,
  onDone,
}: {
  onPick: (due: ScheduledDue) => Promise<void>
  onDone: () => void
}) {
  const [chip, setChip] = useState<ChipKey | null>(null)
  const [customDate, setCustomDate] = useState("")
  const [time, setTime] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const due = buildDue(chip, customDate, time)
  const canSave = due.dueAt !== undefined && !saving

  async function save() {
    if (due.dueAt === undefined || saving) return
    setSaving(true)
    setError(null)
    try {
      await onPick({ dueAt: due.dueAt, hasTime: due.hasTime ?? false })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set the reminder")
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ReminderSchedule
        chip={chip}
        onChipChange={setChip}
        customDate={customDate}
        onCustomDateChange={setCustomDate}
        time={time}
        onTimeChange={setTime}
      />

      {error && <p className="text-[11.5px] text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="xs" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button size="xs" onClick={() => void save()} disabled={!canSave}>
          {saving && <Loader2 className="size-3 animate-spin" />}
          Remind me
        </Button>
      </div>
    </div>
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
        maxLength={300} // mirrors createReminderSchema's cap (lib/validations/reminder.ts)
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            void save()
          }
        }}
        placeholder="Remind me to…"
        aria-label="Reminder text"
      />

      <ReminderSchedule
        chip={chip}
        onChipChange={setChip}
        customDate={customDate}
        onCustomDateChange={setCustomDate}
        time={time}
        onTimeChange={setTime}
      />

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
