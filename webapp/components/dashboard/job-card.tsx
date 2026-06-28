import Link from "next/link"
import { Banknote, Globe, MapPin } from "lucide-react"
import type { Job as DbJob, JobStatus } from "@prisma/client"

import { savedLabel } from "@/lib/dates"
import { siteNameFromUrl } from "@/lib/url"
import { StatusPill } from "@/components/dashboard/status-pill"
import { LogoTile, displayCompany } from "@/components/dashboard/logo-tile"

// The view-model a card renders — a thin, UI-shaped slice of a saved job. Optional
// fields may be null/absent (the extractor doesn't always capture them); the card
// shows only what's present and collapses gracefully toward a defined shape.
export type JobCardData = {
  id: string
  title: string
  company: string
  location?: string | null
  salary?: string | null
  /** The posting/application URL — often an ATS portal, not the company site. */
  url?: string | null
  status: JobStatus
  /** When the row was last saved/updated (sourced from `updatedAt`). */
  savedAt: string | Date
}

/** Map a DB job row to the card's view-model. */
export function toJobCardData(job: DbJob): JobCardData {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    url: job.url,
    status: job.status,
    savedAt: job.updatedAt,
  }
}

// One saved job as a bounded card (the grid on the Saved page). Built as three tiers of
// decreasing weight so the eye lands in order: IDENTITY (logo + title, the lead) → ATTRIBUTES
// (salary, then location) → PROVENANCE (source · saved time, the faintest). Hierarchy is
// carried by type — size, weight, and ink — not by color or dividers: ONE separation
// mechanism, a near-invisible hairline on a white card.
//
// Salary is the attribute a job-seeker scans a board for, so it steps up to full-ink medium —
// the standout value in the card; location stays muted context beneath it. Status is shown
// only when it carries information: a job in the pipeline (Applied/Interviewing/…) gets its
// pill, but the resting "Saved" state is left implicit — every card here is saved.
// Missing fields fall back rather than leaving holes: no logo → icon tile; no company →
// muted italic "Company unknown"; no salary/location → that line is omitted.
export function JobCard({ job }: { job: JobCardData }) {
  const company = displayCompany(job.company)
  const site = siteNameFromUrl(job.url)
  const hasMeta = Boolean(job.salary || job.location)
  const showStatus = job.status !== "SAVED"

  return (
    <Link
      href={`/dashboard/jobs/${job.id}`}
      className="group flex flex-col rounded-xl border border-border bg-background p-5 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {/* Tier 1 — identity: logo + title (the lead) + company; meaningful status pinned right. */}
      <div className="flex items-start gap-3">
        <LogoTile company={company} />

        <div className="min-w-0 flex-1">
          <span className="line-clamp-2 text-base font-semibold leading-snug text-foreground group-hover:text-primary">
            {job.title}
          </span>
          <p
            className={
              company
                ? "mt-0.5 truncate text-[13px] font-medium text-muted-foreground"
                : "mt-0.5 truncate text-[13px] italic text-muted-foreground/70"
            }
          >
            {company ?? "Company unknown"}
          </p>
        </div>

        {showStatus && <StatusPill status={job.status} className="shrink-0" />}
      </div>

      {/* Tier 2 — attributes: salary leads in full ink (the value you scan for), location is
          muted context below it. Icons stay quiet so the values carry the weight. Omitted
          entirely when neither exists, so the card never holds an empty gap. */}
      {hasMeta && (
        <div className="mt-4 flex flex-col gap-2">
          {job.salary && (
            <div className="flex items-center gap-2 text-[15px] font-semibold leading-none text-fern-700">
              <Banknote className="size-4 shrink-0 text-fern-700/70" />
              <span className="min-w-0 truncate">{job.salary}</span>
            </div>
          )}
          {job.location && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <MapPin className="size-4 shrink-0 text-foreground/70" strokeWidth={2.5} />
              <span className="min-w-0 truncate">{job.location}</span>
            </div>
          )}
        </div>
      )}

      {/* Tier 3 — provenance: the faintest line, split to both edges (source left, saved time
          right) so the card closes on a second axis instead of one flat left column. mt-auto
          floats it to the foot, keeping a row of equal-height cards aligned. */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[11.5px] text-muted-foreground/70">
        {/* Source (the site the job came from — Greenhouse, LinkedIn, …) carries the brand's
            primary fern, so the origin reads as a first-class, branded detail next to the
            gray timestamp beside it. */}
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-primary">
          {site && (
            <>
              <Globe className="size-3 shrink-0" />
              <span className="truncate">{site}</span>
            </>
          )}
        </span>
        <span className="shrink-0 whitespace-nowrap tabular-nums">{savedLabel(job.savedAt)}</span>
      </div>
    </Link>
  )
}
