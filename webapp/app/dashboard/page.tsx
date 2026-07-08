import Link from "next/link"
import { ArrowRight, Bookmark } from "lucide-react"

import { getServerUserId } from "@/lib/auth/current-user"
import { getJobStats, listJobs } from "@/lib/server/jobs"
import { greeting, todayLong } from "@/lib/dates"
import { Card } from "@/components/ui/card"
import { JobRow } from "@/components/dashboard/job-row"
import { SectionHeader } from "@/components/dashboard/section-header"
import { StatStrip, type Stat } from "@/components/dashboard/stat-strip"
import { toJobCardData } from "@/components/dashboard/job-card"

export const dynamic = "force-dynamic"

// How many of the most-recent saves to surface on the home screen, and how far back "recently"
// reaches — the home feed only shows the last few days so it stays a genuine "just saved" list;
// everything older lives under "View all".
const RECENT_LIMIT = 12
const RECENT_WINDOW_DAYS = 3

export default async function HomePage() {
  const userId = await getServerUserId()
  const [stats, recentJobs] = await Promise.all([
    getJobStats(userId),
    listJobs(userId, { limit: RECENT_LIMIT }),
  ])
  const cutoff = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const recent = recentJobs
    .filter((job) => new Date(job.createdAt).getTime() >= cutoff)
    .map(toJobCardData)

  // Counts are always shown (0 is real data) so users can scan pipeline volume at a glance.
  const tiles: Stat[] = [
    { label: "Saved", value: stats.total },
    { label: "Applied", value: stats.applications },
    { label: "Interviewing", value: stats.interviewing },
  ]

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-[13px] text-muted-foreground">{todayLong()}</p>
        <h1 className="mt-1 text-3xl font-semibold leading-[1.05] tracking-tight">
          {greeting()}, Souritra
        </h1>
      </header>

      <StatStrip stats={tiles} />

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Recently saved"
          action={
            <Link
              href="/dashboard/saved"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              View all
              <ArrowRight className="size-3" />
            </Link>
          }
        />

        {recent.length === 0 ? (
          <EmptyRecent />
        ) : (
          // Near-white panel on the sidebar surface — barely-there tint so it sits calmly on the
          // white page (no blue cast), matching the sidebar. Rows divide on a hairline, lift to white.
          <Card className="divide-y divide-border/70 overflow-hidden rounded-xl border-border/70 bg-sidebar">
            {recent.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </Card>
        )}
      </section>
    </div>
  )
}

// A warm empty state — an invitation to act, not a gray "no data" box.
function EmptyRecent() {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">
        <Bookmark className="size-5" />
      </span>
      <p className="mt-1 text-sm font-medium">Nothing saved yet</p>
      <p className="max-w-xs text-[13px] text-muted-foreground">
        Save a posting with the extension and it&apos;ll land here, ready to track.
      </p>
    </Card>
  )
}
