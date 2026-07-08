import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

/**
 * Shared chrome for the job page's side panels — a card with a quiet icon-badged header, an
 * optional right-aligned `meta` slot (count pill, hint), and a padded body. One header pattern
 * keeps the To-do / Tracking / Resume panels visually consistent instead of each inventing its
 * own. The badge stays neutral by design: only the Notes hero panel earns fern on this page.
 */
export function PanelCard({
  icon: Icon,
  title,
  meta,
  className,
  children,
}: {
  icon: LucideIcon
  title: string
  meta?: ReactNode
  className?: string
  children: ReactNode
}) {
  // No `overflow-hidden` on the Card: content is padded so nothing bleeds to its rounded corners,
  // and clipping would trap escaping UI (e.g. the resume picker's dropdown) inside it.
  return (
    <Card className={cn(className)}>
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {meta && <div className="ml-auto flex items-center">{meta}</div>}
      </div>
      <div className="px-4 pb-4 pt-3.5">{children}</div>
    </Card>
  )
}
