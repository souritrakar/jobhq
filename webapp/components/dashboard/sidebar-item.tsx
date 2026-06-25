import Link from "next/link"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// One sidebar nav row (Wise/Linear pattern). The active row carries no saturated fill:
// it's a quiet neutral cool-gray surface (--secondary) with near-black text, and fern shows
// up only twice — the icon turns fern and a thin fern bar marks the left edge. Inactive rows
// are muted gray text + gray icons that warm to a faint surface on hover. Icons hold one size.
export function SidebarItem({
  href,
  label,
  icon: Icon,
  active = false,
  count,
  onNavigate,
}: {
  href: string
  label: string
  icon: LucideIcon
  active?: boolean
  /** Optional trailing count (e.g. number of saved jobs). Omitted when undefined. */
  count?: number
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
        />
      )}
      <Icon
        className={cn("size-[17px] shrink-0", active && "text-primary")}
        strokeWidth={2}
      />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      )}
    </Link>
  )
}
