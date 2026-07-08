"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Bookmark, Columns3, LayoutGrid, Plus, Search } from "lucide-react"
import type { JobStatus } from "@prisma/client"

import { cn } from "@/lib/utils"
import { useStatusSync } from "@/lib/jobs/use-status-sync"
import { STATUS_STYLES } from "@/lib/jobs/status-styles"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { JobCard, type JobCardData } from "@/components/dashboard/job-card"
import { KanbanBoard } from "@/components/dashboard/kanban-board"
import { ImportJobDialog } from "@/components/dashboard/import-job-dialog"

const FILTERS: { label: string; value: JobStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Saved", value: "SAVED" },
  { label: "Applied", value: "APPLIED" },
  { label: "Interviewing", value: "INTERVIEWING" },
  { label: "Offer", value: "OFFER" },
]

type View = "list" | "board"

// Client-side search + status filter over the user's saved jobs. The list is fetched on the
// server and passed in; this owns a working copy so the board can move cards between stages
// optimistically (and roll back on a failed save). Two views share that copy: the masonry
// list and the drag-and-drop Kanban board.
export function SavedJobsBrowser({ jobs: initialJobs }: { jobs: JobCardData[] }) {
  const [jobs, setJobs] = useState(initialJobs)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<JobStatus | "ALL">("ALL")
  const [view, setView] = useState<View>("list")
  const [error, setError] = useState<string | null>(null)

  // Narrow by search first; the status filter applies on top of it (list view only).
  const queried = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === "") return jobs
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        (j.location ?? "").toLowerCase().includes(q),
    )
  }, [jobs, query])

  const visible = useMemo(
    () => queried.filter((j) => filter === "ALL" || j.status === filter),
    [queried, filter],
  )

  // Persistence for board moves: writes are batched + debounced (see useStatusSync) so a flurry of
  // drags collapses into one request. On a failed save the affected rows are reverted to whatever
  // the database last had.
  const syncStatus = useStatusSync(
    initialJobs.map((j) => ({ id: j.id, status: j.status })),
    (restore) => {
      setJobs((cur) =>
        cur.map((j) => {
          const r = restore.find((x) => x.id === j.id)
          return r ? { ...j, status: r.status } : j
        }),
      )
      setError("Couldn't save some changes, so they've been reverted. Please try again.")
    },
  )

  // Move a card to a new stage: update the working copy immediately (optimistic), then hand the
  // change to the batched sync. UI is instant; the DB write happens on the debounce/flush.
  function moveJob(id: string, next: JobStatus) {
    const previous = jobs.find((j) => j.id === id)?.status
    if (!previous || previous === next) return
    setError(null)
    setJobs((cur) => cur.map((j) => (j.id === id ? { ...j, status: next } : j)))
    syncStatus(id, next)
  }

  const isEmpty = jobs.length === 0

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Saved jobs</h1>
      </header>

      {!isEmpty && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search jobs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status filter — list view only; the board shows every stage as a column. */}
            {view === "list" && (
              <div className="flex flex-wrap gap-1 rounded-md border border-border bg-card p-1">
                {FILTERS.map((f) => {
                  const active = filter === f.value
                  // The active tab wears its own status color (same soft fill + foreground as the
                  // pill and board), so selecting "Interviewing" tints the control the interviewing
                  // hue. "All" has no status, so it keeps the neutral selected treatment.
                  const activeClass =
                    f.value === "ALL"
                      ? "bg-secondary text-secondary-foreground"
                      : cn(STATUS_STYLES[f.value].fill, STATUS_STYLES[f.value].fg)
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter(f.value)}
                      aria-pressed={active}
                      className={cn(
                        "cursor-pointer rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                        active ? activeClass : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* View switcher — list vs. Kanban board. */}
            <div className="flex gap-1 rounded-md border border-border bg-card p-1">
              <ViewButton
                active={view === "list"}
                onClick={() => setView("list")}
                icon={<LayoutGrid className="size-4" />}
                label="List"
              />
              <ViewButton
                active={view === "board"}
                onClick={() => setView("board")}
                icon={<Columns3 className="size-4" />}
                label="Board"
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-status-rejected-foreground/20 bg-status-rejected px-3 py-2 text-sm text-status-rejected-foreground"
        >
          {error}
        </p>
      )}

      {isEmpty ? (
        <EmptyState
          title="No saved jobs yet"
          body="Paste a job posting link to save your first one, or capture jobs from any site with the extension."
          action={
            <ImportJobDialog
              trigger={
                <Button size="lg" className="mt-2 gap-2">
                  <Plus className="size-4" strokeWidth={2.5} />
                  Save a job
                </Button>
              }
            />
          }
        />
      ) : view === "board" ? (
        <KanbanBoard jobs={queried} onMove={moveJob} />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No matching jobs"
          body="Try a different search or filter."
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {visible.length} {visible.length === 1 ? "job" : "jobs"}
          </p>
          {/* Masonry pack: cards take their natural height and nest tightly instead of
              every card in a row inheriting the tallest one's height. Column gap stays
              comfortable; the vertical gap (the wrapper's mb) is tighter, so short cards
              don't leave holes and rows don't drift apart. */}
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
            {visible.map((job) => (
              <div key={job.id} className="mb-3 break-inside-avoid">
                <JobCard job={job} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <Card className="flex flex-col items-center gap-2 border-dashed px-6 py-16 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Bookmark className="size-5" />
      </span>
      <p className="mt-1 font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </Card>
  )
}
