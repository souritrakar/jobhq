import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

// Tone drives the leading icon badge so each panel reads at a glance: fern for "yours"
// (notes), amber for time-sensitive (reminders), neutral for quiet metadata.
const BADGE_TONE = {
  neutral: "bg-secondary text-muted-foreground",
  fern: "bg-primary text-primary-foreground shadow-sm",
  amber: "bg-status-interviewing text-status-interviewing-foreground",
} as const

/**
 * Shared chrome for the job page's side panels — a card with an icon-badged header, an optional
 * right-aligned `meta` slot (count pill, hint), and a padded body. One header pattern keeps the
 * Notes / Reminders / Tracking / Resume panels visually consistent instead of each inventing its own.
 */
export function PanelCard({
  icon: Icon,
  title,
  meta,
  tone = "neutral",
  className,
  children,
}: {
  icon: LucideIcon
  title: string
  meta?: ReactNode
  tone?: keyof typeof BADGE_TONE
  className?: string
  children: ReactNode
}) {
  // No `overflow-hidden` on the Card: content is padded so nothing bleeds to its rounded corners,
  // and clipping would trap escaping UI (e.g. the resume picker's dropdown) inside it.
  return (
    <Card className={cn(className)}>
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", BADGE_TONE[tone])}>
          <Icon className="size-4" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {meta && <div className="ml-auto flex items-center">{meta}</div>}
      </div>
      <div className="px-4 pb-4 pt-3.5">{children}</div>
    </Card>
  )
}
