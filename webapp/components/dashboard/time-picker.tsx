"use client"

import { useEffect, useRef, useState } from "react"
import { Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Time is carried as a 24h "HH:mm" string (or "" for unset) — the same shape buildDue and the
// interview picker already use. The UI presents it as 12h with an AM/PM column.

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1) // 1…12
const MINUTES = Array.from({ length: 60 }, (_, i) => i) // 0,1,…,59 — every minute (fully liberal)
const PERIODS = ["AM", "PM"] as const

type Parts = { h12: number; min: number; period: (typeof PERIODS)[number] }

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

// 24h hour for a 12h hour + period, and the resulting minute-of-day (0–1439). Used to compare a
// candidate time against a `minTime` floor so slots earlier today than "now" can be disabled.
function to24(h12: number, period: (typeof PERIODS)[number]): number {
  return (h12 % 12) + (period === "PM" ? 12 : 0)
}

function minuteOfDay({ h12, min, period }: Parts): number {
  return to24(h12, period) * 60 + min
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number)
  return h * 60 + m
}

function parse(value: string): Parts | null {
  if (!value) return null
  const [h, m] = value.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return { h12: h % 12 === 0 ? 12 : h % 12, min: m, period: h >= 12 ? "PM" : "AM" }
}

function compose({ h12, min, period }: Parts): string {
  const h = (h12 % 12) + (period === "PM" ? 12 : 0)
  return `${pad(h)}:${pad(min)}`
}

/** "2:30 PM" for a 24h "HH:mm" value, or null when unset. */
export function format12h(value: string): string | null {
  const p = parse(value)
  return p ? `${p.h12}:${pad(p.min)} ${p.period}` : null
}

/**
 * Three scrollable columns — hour, minute (every minute), AM/PM — that read and write a 24h "HH:mm"
 * string. Chrome-free so it can sit inside the interview picker beside the calendar, or inside the
 * TimePicker popover for reminders. Picking any column commits a full time, so a single tap is
 * enough to set a time. When `minTime` is given (e.g. a reminder that lands today), every slot
 * earlier than it is disabled and can't be committed — so you can't schedule a reminder in the past.
 */
export function TimeColumns({
  value,
  onChange,
  className,
  minTime,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  /** Earliest selectable time as 24h "HH:mm". Omit for no floor (e.g. logging a past interview). */
  minTime?: string
}) {
  const parts = parse(value)
  const minMod = minTime ? hmToMinutes(minTime) : null
  // Reference selection for the dependent (hour→minute) disabling, and the fallback `set` uses
  // before any value is chosen: the floor time when restricted, else 9:00 AM.
  const defaultSeed: Parts = (minTime ? parse(minTime) : null) ?? { h12: 9, min: 0, period: "AM" }
  const seed = parts ?? defaultSeed

  function set(patch: Partial<Parts>) {
    const next: Parts = { ...seed, ...patch }
    // Never commit a past time under a floor — snap back to the earliest allowed moment.
    if (minMod !== null && minuteOfDay(next) < minMod) {
      onChange(compose(defaultSeed))
      return
    }
    onChange(compose(next))
  }

  return (
    <div className={cn("flex h-44 gap-1", className)}>
      <Column
        label="Hr"
        items={HOURS.map((h) => ({
          key: h,
          label: String(h),
          selected: parts?.h12 === h,
          disabled: minMod !== null && to24(h, seed.period) * 60 + 59 < minMod,
        }))}
        onPick={(h) => set({ h12: h })}
      />
      <Column
        label="Min"
        items={MINUTES.map((m) => ({
          key: m,
          label: pad(m),
          selected: parts?.min === m,
          disabled: minMod !== null && to24(seed.h12, seed.period) * 60 + m < minMod,
        }))}
        onPick={(m) => set({ min: m })}
      />
      <Column
        label="AM/PM"
        items={PERIODS.map((p) => ({
          key: p,
          label: p,
          selected: parts?.period === p,
          disabled: minMod !== null && p === "AM" && 11 * 60 + 59 < minMod,
        }))}
        onPick={(p) => set({ period: p })}
      />
    </div>
  )
}

function Column<T extends string | number>({
  label,
  items,
  onPick,
}: {
  label: string
  items: { key: T; label: string; selected: boolean; disabled?: boolean }[]
  onPick: (key: T) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  // Bring the selected row into view when the column mounts (e.g. the popover opens on an existing
  // value), so editing 8:45 PM doesn't start scrolled to the top.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-selected=true]")
    el?.scrollIntoView({ block: "center" })
  }, [])

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="px-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <div
        ref={listRef}
        className="flex flex-col gap-0.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]"
      >
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            data-selected={it.selected}
            disabled={it.disabled}
            onClick={() => onPick(it.key)}
            className={cn(
              "shrink-0 rounded-md px-2 py-1.5 text-center text-[13px] tabular-nums transition-colors",
              it.selected
                ? "bg-primary font-medium text-primary-foreground"
                : "text-foreground hover:bg-muted",
              it.disabled && "cursor-not-allowed text-muted-foreground/25 hover:bg-transparent",
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A compact time control: a pill showing the chosen time (or a placeholder), opening the scroll
 * columns in a popover. Time stays optional — a "Clear" action unsets it. Used on the reminder
 * composer's chip row.
 */
export function TimePicker({
  value,
  onChange,
  placeholder = "Add time",
  align = "end",
  minTime,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  align?: "start" | "center" | "end"
  /** Earliest selectable time as 24h "HH:mm" — forwarded to TimeColumns to bar past slots. */
  minTime?: string
}) {
  const [open, setOpen] = useState(false)
  const label = format12h(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Reminder time (optional)"
        className={cn(
          "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[13px] tabular-nums transition-colors",
          "hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
          "data-[popup-open]:border-primary/50",
          label ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Clock className="size-3.5 shrink-0 text-muted-foreground" />
        {label ?? placeholder}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-56">
        <TimeColumns value={value} onChange={onChange} minTime={minTime} />
        {label && (
          <button
            type="button"
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
            className="mt-0.5 w-full rounded-md py-1.5 text-center text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Clear time
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
