import type { JobStatus } from "@prisma/client"

import { cn } from "@/lib/utils"

// Pipeline status as a soft, low-saturation pill with a leading dot. All colors come from
// the shared status tokens (design-system/tokens.css), so saved/applied/etc. stay
// consistent and read as part of the paper world — never cool UI chrome. Pills are reserved
// for genuine status; plain metadata (location, salary) stays muted text, not a pill.
//
// Every className below is a complete literal string so Tailwind's JIT generates it.
const CONFIG: Record<JobStatus, { label: string; fill: string; fg: string; dot: string }> = {
  SAVED: {
    label: "Saved",
    fill: "bg-status-saved",
    fg: "text-status-saved-foreground",
    dot: "bg-status-saved-foreground",
  },
  APPLIED: {
    label: "Applied",
    fill: "bg-status-applied",
    fg: "text-status-applied-foreground",
    dot: "bg-status-applied-foreground",
  },
  INTERVIEWING: {
    label: "Interviewing",
    fill: "bg-status-interviewing",
    fg: "text-status-interviewing-foreground",
    dot: "bg-status-interviewing-foreground",
  },
  OFFER: {
    label: "Offer",
    fill: "bg-status-offer",
    fg: "text-status-offer-foreground",
    dot: "bg-status-offer-foreground",
  },
  REJECTED: {
    label: "Rejected",
    fill: "bg-status-rejected",
    fg: "text-status-rejected-foreground",
    dot: "bg-status-rejected-foreground",
  },
  ARCHIVED: {
    label: "Archived",
    fill: "bg-status-archived",
    fg: "text-status-archived-foreground",
    dot: "bg-status-archived-foreground",
  },
}

export function StatusPill({
  status,
  subtle = false,
  className,
}: {
  status: JobStatus
  /** Drop the fill — dot + muted label only. For the resting "Saved" state and dense rows. */
  subtle?: boolean
  className?: string
}) {
  const { label, fill, fg, dot } = CONFIG[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full text-xs font-medium",
        subtle ? "text-muted-foreground" : cn("px-2 py-0.5", fill, fg),
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      {label}
    </span>
  )
}
