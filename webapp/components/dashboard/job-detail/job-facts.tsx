import { Banknote, Briefcase, Laptop, MapPin } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The scannable spec bar — the job's most-load-bearing attributes as an icon-led strip directly
 * under the title. Salary leads in fern (the value a seeker scans for); everything else is quiet
 * by comparison. Absent fields drop out so the bar never holds an empty slot. Returns null when
 * the posting captured none of them, so the page doesn't render an empty band.
 */
export function JobFacts({
  job,
}: {
  job: {
    salary: string | null
    location: string | null
    workplaceType: string | null
    employmentType: string | null
  }
}) {
  const facts: React.ReactNode[] = []

  if (job.salary)
    facts.push(
      <Fact key="salary" icon={Banknote} label="Salary" accent>
        {job.salary}
      </Fact>,
    )
  if (job.location)
    facts.push(
      <Fact key="location" icon={MapPin} label="Location">
        {job.location}
      </Fact>,
    )
  if (job.workplaceType)
    facts.push(
      <Fact key="workplace" icon={Laptop} label="Workplace">
        {job.workplaceType}
      </Fact>,
    )
  if (job.employmentType)
    facts.push(
      <Fact key="employment" icon={Briefcase} label="Employment type">
        {job.employmentType}
      </Fact>,
    )
  if (facts.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-border/70 py-4">
      {facts}
    </div>
  )
}

function Fact({
  icon: Icon,
  label,
  accent = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <Icon className={cn("size-4 shrink-0", accent ? "text-fern-700/70" : "text-muted-foreground")} />
      <span
        className={cn(
          "flex items-center whitespace-nowrap",
          accent ? "text-[15px] font-semibold text-fern-700" : "text-sm font-medium text-foreground",
        )}
      >
        {children}
      </span>
    </div>
  )
}
