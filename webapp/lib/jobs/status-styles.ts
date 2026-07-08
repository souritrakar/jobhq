import type { JobStatus } from "@prisma/client"

// Single source of truth for a pipeline status' color, drawn from the shared status tokens
// (design-system/tokens.css): a soft `fill` background, a strong `fg` foreground, and a `dot`
// that matches the foreground. Reused by the status pill, the board's column bands, and the
// saved-jobs filter tabs so a status reads the same everywhere — Applied is the same warm clay
// whether it's a pill, a Kanban header, or the active "Applied" tab.
//
// Every value is a complete literal class string so Tailwind's JIT emits it.
export type StatusStyle = { fill: string; fg: string; dot: string }

export const STATUS_STYLES: Record<JobStatus, StatusStyle> = {
  SAVED: {
    fill: "bg-status-saved",
    fg: "text-status-saved-foreground",
    dot: "bg-status-saved-foreground",
  },
  APPLIED: {
    fill: "bg-status-applied",
    fg: "text-status-applied-foreground",
    dot: "bg-status-applied-foreground",
  },
  INTERVIEWING: {
    fill: "bg-status-interviewing",
    fg: "text-status-interviewing-foreground",
    dot: "bg-status-interviewing-foreground",
  },
  OFFER: {
    fill: "bg-status-offer",
    fg: "text-status-offer-foreground",
    dot: "bg-status-offer-foreground",
  },
  REJECTED: {
    fill: "bg-status-rejected",
    fg: "text-status-rejected-foreground",
    dot: "bg-status-rejected-foreground",
  },
  ARCHIVED: {
    fill: "bg-status-archived",
    fg: "text-status-archived-foreground",
    dot: "bg-status-archived-foreground",
  },
}
