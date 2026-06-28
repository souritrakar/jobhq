"use client"

import { useState } from "react"
import { CalendarDays } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TimePicker } from "@/components/dashboard/time-picker"
import { CHIPS, type ChipKey } from "@/lib/reminders/schedule"

const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fromYmd(value: string): Date | undefined {
  if (!value) return undefined
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/**
 * The shared "when?" controls for a reminder — relative quick-pick chips, with "Pick date" opening a
 * calendar popover directly (no inline panel) and the time picker tucked on the right of the same
 * row. Fully controlled: it owns no scheduling state, so both the per-job popover and the standalone
 * feed composer drive it from their own `useState` and read the same values back into `buildDue`.
 */
export function ReminderSchedule({
  chip,
  onChipChange,
  customDate,
  onCustomDateChange,
  time,
  onTimeChange,
}: {
  chip: ChipKey | null
  onChipChange: (chip: ChipKey | null) => void
  customDate: string
  onCustomDateChange: (value: string) => void
  time: string
  onTimeChange: (value: string) => void
}) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const customActive = chip === "custom"
  const customSelected = customActive && customDate ? fromYmd(customDate) : undefined

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CHIPS.map((c) => {
        if (c.key === "custom") {
          return (
            <Popover key={c.key} open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger
                aria-pressed={customActive}
                className={cn(chipClass(customActive))}
              >
                <CalendarDays className="size-3.5" />
                {customSelected ? dateLabel.format(customSelected) : c.label}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  autoFocus
                  selected={customSelected}
                  defaultMonth={customSelected}
                  onSelect={(date) => {
                    if (!date) return
                    onCustomDateChange(toYmd(date))
                    onChipChange("custom")
                    setCalendarOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          )
        }

        const active = chip === c.key
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChipChange(active ? null : c.key)}
            className={cn(chipClass(active))}
          >
            {c.label}
          </button>
        )
      })}

      {/* Time sits at the right edge of the chip row (wraps under on narrow popovers). */}
      <div className="ml-auto">
        <TimePicker value={time} onChange={onTimeChange} />
      </div>
    </div>
  )
}

function chipClass(active: boolean): string {
  return cn(
    "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
    active
      ? "border-primary bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
  )
}
