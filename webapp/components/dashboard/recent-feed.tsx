import { cn } from "@/lib/utils"
import { savedBucket, type SavedBucket } from "@/lib/dates"
import { Card } from "@/components/ui/card"
import { JobRow } from "@/components/dashboard/job-row"
import type { JobCardData } from "@/components/dashboard/job-card"

// The home "Recently saved" feed: one calm panel where recency is the structure, not a label
// repeated on every row. Jobs are bucketed under quiet date subheaders (Today / Earlier this
// week / …) so the section reads like a journal of momentum. Empty buckets never render — the
// headers you see are the only ones with jobs beneath them.
const GROUPS: { key: SavedBucket; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "Earlier this week" },
  { key: "lastWeek", label: "Last week" },
  { key: "earlier", label: "Earlier" },
]

export function RecentFeed({ jobs }: { jobs: JobCardData[] }) {
  const groups = GROUPS.map((g) => ({
    ...g,
    jobs: jobs.filter((job) => savedBucket(job.savedAt) === g.key),
  })).filter((g) => g.jobs.length > 0)

  // Near-white panel on the sidebar surface — a faint cool tint that sits calmly on the white
  // page (no blue cast) and matches the app chrome. Rows lift to white on hover.
  return (
    <Card className="overflow-hidden rounded-xl border-border/70 bg-sidebar py-0">
      {groups.map((group, i) => (
        <section key={group.key}>
          {/* Group header = structure, not content: faint, small, and letterspaced so the job
              titles below stay dominant. A hairline above each group but the first divides them. */}
          <h3
            className={cn(
              "px-4 pb-1.5 pt-3.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60",
              i > 0 && "border-t border-border/60",
            )}
          >
            {group.label}
          </h3>
          <div className="divide-y divide-border/50">
            {group.jobs.map((job) => (
              <JobRow key={job.id} job={job} showTimestamp={false} />
            ))}
          </div>
        </section>
      ))}
    </Card>
  )
}
