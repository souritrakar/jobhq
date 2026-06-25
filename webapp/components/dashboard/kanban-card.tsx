import { Banknote, MapPin } from "lucide-react"

import { cn } from "@/lib/utils"
import { savedLabel } from "@/lib/dates"
import { LogoTile, displayCompany } from "@/components/dashboard/logo-tile"
import type { JobCardData } from "@/components/dashboard/job-card"

// The Kanban variant of a job card — denser than the grid card because columns are narrow.
// The column already names the pipeline stage, so the status pill is dropped; we keep the
// scannable essentials (identity, salary, location) and a quiet "saved" timestamp. Purely
// presentational: the same component renders both the in-column card and the drag overlay.
export function KanbanCard({
  job,
  overlay = false,
  className,
}: {
  job: JobCardData
  /** Rendered floating under the cursor in a DragOverlay — lifts with a stronger shadow + tilt. */
  overlay?: boolean
  className?: string
}) {
  const company = displayCompany(job.company)
  const hasMeta = Boolean(job.salary || job.location)

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-border bg-background p-3.5 transition-shadow",
        overlay
          ? "rotate-2 cursor-grabbing shadow-lg ring-1 ring-primary/15"
          : "shadow-xs hover:border-border/80 hover:shadow-sm",
        className,
      )}
    >
      {/* Identity — logo + title + company */}
      <div className="flex items-start gap-2.5">
        <LogoTile company={company} className="size-8 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-foreground">
            {job.title}
          </p>
          <p
            className={cn(
              "mt-0.5 truncate text-xs",
              company ? "text-muted-foreground" : "italic text-muted-foreground/70",
            )}
          >
            {company ?? "Company unknown"}
          </p>
        </div>
      </div>

      {/* Attributes — salary + location, only when present */}
      {hasMeta && (
        <div className="flex flex-col gap-1.5">
          {job.salary && (
            <div className="flex items-center gap-1.5 text-xs font-semibold leading-none text-fern-700">
              <Banknote className="size-3.5 shrink-0 text-fern-700/70" />
              <span className="min-w-0 truncate">{job.salary}</span>
            </div>
          )}
          {job.location && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0 opacity-70" />
              <span className="min-w-0 truncate">{job.location}</span>
            </div>
          )}
        </div>
      )}

      {/* Provenance — a quiet saved-at, right-aligned */}
      <div className="flex justify-end text-[11px] tabular-nums text-muted-foreground/70">
        {savedLabel(job.savedAt)}
      </div>
    </div>
  )
}
