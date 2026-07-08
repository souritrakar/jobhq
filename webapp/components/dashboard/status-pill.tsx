import type { JobStatus } from "@prisma/client"

import { cn } from "@/lib/utils"
import { STATUS_STYLES } from "@/lib/jobs/status-styles"

// Pipeline status as a soft, low-saturation pill with a leading dot. Colors come from the shared
// status styles (lib/jobs/status-styles.ts → design-system tokens), so saved/applied/etc. read the
// same here as on the board and the filter tabs — part of the paper world, never cool UI chrome.
// Pills are reserved for genuine status; plain metadata (location, salary) stays muted text.
const LABELS: Record<JobStatus, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
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
  const label = LABELS[status]
  const { fill, fg, dot } = STATUS_STYLES[status]
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
