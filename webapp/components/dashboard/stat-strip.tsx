import { cn } from "@/lib/utils"

export type Stat = {
  label: string
  /** Display value. Pass `null` for a metric with no data yet — it's filtered out, never shown as a dead slot. */
  value: string | number | null
  /** Render the number in fern. Reserve for the single positive/progress metric. */
  accent?: boolean
}

// Inline metric strip — numbers separated by hairline rules, no boxes. Metrics with no data
// (`value: null`) are dropped so the strip never shows an empty/"—" slot; it reflows to the
// metrics that do have data. At most one accent number (the positive signal); rest neutral.
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  const visible = stats.filter((s) => s.value !== null && s.value !== undefined)
  if (visible.length === 0) return null

  return (
    <dl className={cn("flex border-y border-border", className)}>
      {visible.map((s) => (
        <div
          key={s.label}
          className="min-w-[8.5rem] px-6 py-4 first:pl-0 [&+div]:border-l [&+div]:border-border"
        >
          <dd
            className={cn(
              "text-2xl font-semibold leading-none tracking-tight tabular-nums",
              s.accent && "text-primary",
            )}
          >
            {s.value}
          </dd>
          <dt className="mt-1.5 text-xs text-muted-foreground">{s.label}</dt>
        </div>
      ))}
    </dl>
  )
}
