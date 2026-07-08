"use client"

import { useMemo, useRef, useState } from "react"
import {
  Check,
  CircleAlert,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
} from "lucide-react"
import type { Job, JobApplication } from "@prisma/client"

import { cn } from "@/lib/utils"
import { LogoTile, displayCompany } from "@/components/dashboard/logo-tile"

// The slice of a saved job this feature needs — enough to pick it, show it, and generate from it.
export type JobOption = {
  id: string
  title: string
  company: string
  location?: string | null
  logoUrl?: string | null
  url?: string | null
}

type ImportedJob = Job & { application: JobApplication | null }
type ImportResult =
  | { outcome: "saved"; job: ImportedJob }
  | { outcome: "application_only"; questions: unknown[] }

function toOption(job: ImportedJob): JobOption {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    logoUrl: job.logoUrl,
    url: job.url,
  }
}

function withScheme(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(withScheme(raw))
    return Boolean(u.hostname) && u.hostname.includes(".")
  } catch {
    return false
  }
}

const inputClass = cn(
  "h-10 w-full min-w-0 rounded-md border border-border bg-background pl-9 pr-3 text-sm shadow-xs transition-colors",
  "placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60",
)

/**
 * Job selection for the cover-letter generator. Two ways in, matching the PRD: pick an existing
 * saved job from a searchable list, or paste a posting URL — the link path reuses the exact same
 * `POST /api/jobs/import` mechanism as the sidebar "Save a job" button, so the posting is saved to
 * the DB as a new job and then selected. The parent owns the job list (so an imported job persists
 * and stays selectable); this component just searches it, imports into it, and reports selection.
 */
export function JobPicker({
  jobs,
  selectedId,
  onSelect,
  onAddJob,
}: {
  jobs: JobOption[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddJob: (job: JobOption) => void
}) {
  const selected = jobs.find((j) => j.id === selectedId) ?? null
  // Collapse to a compact summary once a job is chosen; "Change" reopens the browser.
  const [browsing, setBrowsing] = useState(!selected)

  if (selected && !browsing) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <JobLogo job={selected} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{selected.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {displayCompany(selected.company) ?? "Company unknown"}
            {selected.location ? ` · ${selected.location}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBrowsing(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3.5" />
          Change
        </button>
      </div>
    )
  }

  return (
    <JobBrowser
      jobs={jobs}
      selectedId={selectedId}
      onSelect={(id) => {
        onSelect(id)
        setBrowsing(false)
      }}
      onAddJob={(job) => {
        onAddJob(job)
        setBrowsing(false)
      }}
    />
  )
}

type Mode = "saved" | "link"

function JobBrowser({
  jobs,
  selectedId,
  onSelect,
  onAddJob,
}: {
  jobs: JobOption[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddJob: (job: JobOption) => void
}) {
  const [mode, setMode] = useState<Mode>(jobs.length > 0 ? "saved" : "link")

  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        <ModeTab active={mode === "saved"} onClick={() => setMode("saved")} label="Saved jobs" />
        <ModeTab active={mode === "link"} onClick={() => setMode("link")} label="Paste a link" />
      </div>

      <div className="pt-2.5">
        {mode === "saved" ? (
          <SavedList jobs={jobs} selectedId={selectedId} onSelect={onSelect} onPasteLink={() => setMode("link")} />
        ) : (
          <LinkImport onAddJob={onAddJob} />
        )}
      </div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}

function SavedList({
  jobs,
  selectedId,
  onSelect,
  onPasteLink,
}: {
  jobs: JobOption[]
  selectedId: string | null
  onSelect: (id: string) => void
  onPasteLink: () => void
}) {
  const [query, setQuery] = useState("")
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        (j.location ?? "").toLowerCase().includes(q),
    )
  }, [jobs, query])

  if (jobs.length === 0) {
    return (
      <div className="px-2 py-6 text-center">
        <p className="text-sm font-medium text-foreground">No saved jobs yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste a job posting link to add your first one.
        </p>
        <button
          type="button"
          onClick={onPasteLink}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          <Link2 className="size-3.5" />
          Paste a link
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          autoComplete="off"
          placeholder="Search saved jobs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="mt-2 flex max-h-60 flex-col gap-0.5 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No jobs match “{query.trim()}”.
          </p>
        ) : (
          visible.map((job) => {
            const active = job.id === selectedId
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => onSelect(job.id)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
                  active ? "bg-primary/10" : "hover:bg-muted/60",
                )}
              >
                <JobLogo job={job} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {job.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {displayCompany(job.company) ?? "Company unknown"}
                    {job.location ? ` · ${job.location}` : ""}
                  </span>
                </span>
                {active && (
                  <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function LinkImport({ onAddJob }: { onAddJob: (job: JobOption) => void }) {
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!isValidUrl(url) || busy) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/jobs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: withScheme(url) }),
        signal: controller.signal,
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.data) {
        setError(body?.error?.message ?? "Couldn't read that posting. Please try again.")
        return
      }
      const result = body.data as ImportResult
      if (result.outcome === "application_only") {
        setError(
          "That looks like an application page. Paste the main job posting link (the role overview) instead.",
        )
        return
      }
      onAddJob(toOption(result.job))
      setUrl("")
    } catch {
      if (controller.signal.aborted) return
      setError("We couldn't reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative">
        <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://…  paste a job posting link"
          value={url}
          disabled={busy}
          onChange={(e) => {
            setUrl(e.target.value)
            if (error) setError(null)
          }}
          className={inputClass}
        />
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="min-h-4 text-[11px] text-muted-foreground" aria-live="polite">
          {busy ? "Reading the posting. This can take up to a minute." : "We'll save it to your jobs, then select it."}
        </span>
        <button
          type="submit"
          disabled={!isValidUrl(url) || busy}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {busy ? (
            <>
              <LoaderCircle className="size-3.5 animate-spin" />
              Working…
            </>
          ) : (
            <>
              <Plus className="size-3.5" strokeWidth={2.5} />
              Fetch &amp; save
            </>
          )}
        </button>
      </div>
    </form>
  )
}

// The captured company logo when present (Firecrawl branding), else the standard tinted-initial
// tile — including when the external image URL 404s at render time.
function JobLogo({ job }: { job: JobOption }) {
  const [broken, setBroken] = useState(false)
  if (job.logoUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary external logo host
      <img
        src={job.logoUrl}
        alt=""
        onError={() => setBroken(true)}
        className="size-9 shrink-0 rounded-[30%] border border-border bg-white object-contain p-1"
      />
    )
  }
  return <LogoTile company={displayCompany(job.company)} />
}
