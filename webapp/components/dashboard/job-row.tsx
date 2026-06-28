import Link from "next/link"

import { cn } from "@/lib/utils"
import { savedLabel } from "@/lib/dates"
import { siteNameFromUrl } from "@/lib/url"
import { StatusPill } from "@/components/dashboard/status-pill"
import { LogoTile, displayCompany } from "@/components/dashboard/logo-tile"
import type { JobCardData } from "@/components/dashboard/job-card"

// One saved job as a transaction-style row (the Wise/Linear feed): identity reads down the
// left, and salary — the value you scan a job list for — anchors the right edge in fern.
// Three type tiers carry the hierarchy, so the eye lands in order:
//   1. TITLE      — full ink, medium weight: the focal point.
//   2. COMPANY    — muted ink, medium weight: the identity anchor on the metadata line.
//   3. LOCATION   — fainter ink, normal weight, behind a hairline middot: context, not a peer.
// Company and location used to sit at the same size/weight/ink, so neither led; now weight and
// ink step location down a rung beneath the company it belongs to.
// "Saved" is never shown — every job here is saved, so only a real pipeline stage
// (Applied/Interviewing/…) earns a pill. Optional fields degrade to a defined shape: no logo →
// icon tile; no company → muted italic "Company unknown"; no location/salary → that bit simply
// doesn't render. `showTimestamp` is dropped in the home feed, where a date-group header above
// the row already carries recency and repeating "Xd ago" on every row is redundant noise.
export function JobRow({
  job,
  showTimestamp = true,
}: {
  job: JobCardData
  showTimestamp?: boolean
}) {
  const company = displayCompany(job.company)
  const site = siteNameFromUrl(job.url)
  const showStatus = job.status !== "SAVED"

  return (
    <Link
      href={`/dashboard/jobs/${job.id}`}
      className="group flex items-center gap-3.5 rounded-lg px-4 py-3.5 transition-colors hover:bg-background focus-visible:bg-background focus-visible:outline-none"
    >
      <LogoTile company={company} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
            {job.title}
          </span>
          {showStatus && <StatusPill status={job.status} className="shrink-0" />}
        </div>

        {/* Metadata line: company leads (medium weight, muted ink), location recedes behind a
            faint middot (normal weight, fainter ink) — a clear rung beneath its company. */}
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px]">
          <span
            className={cn(
              "truncate font-medium text-muted-foreground",
              !company && "font-normal italic text-muted-foreground/70",
            )}
          >
            {company ?? "Company unknown"}
          </span>
          {job.location && (
            <>
              <span aria-hidden className="shrink-0 text-muted-foreground/40">
                ·
              </span>
              <span className="truncate font-normal text-muted-foreground/70">{job.location}</span>
            </>
          )}
          {site && (
            <>
              <span aria-hidden className="shrink-0 text-muted-foreground/40">
                ·
              </span>
              {/* Source (Greenhouse, LinkedIn, …) carries the brand's primary fern so the
                  origin reads as a branded, first-class detail on the metadata line. */}
              <span className="shrink-0 font-medium text-primary">{site}</span>
            </>
          )}
        </p>
      </div>

      {/* Right anchor — salary (the value) in fern; tabular figures line up cleanly down the
          column. Falls back to the saved timestamp, and to nothing when both are absent
          (in the home feed the group header carries recency, so the timestamp is suppressed). */}
      <div className="flex shrink-0 flex-col items-end gap-0.5 pl-2 text-right">
        {job.salary && (
          <span className="whitespace-nowrap text-sm font-medium tabular-nums text-primary">
            {job.salary}
          </span>
        )}
        {showTimestamp && (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {savedLabel(job.savedAt)}
          </span>
        )}
      </div>
    </Link>
  )
}
