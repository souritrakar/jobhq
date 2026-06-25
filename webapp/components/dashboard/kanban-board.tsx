"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import type { JobStatus } from "@prisma/client"

import { cn } from "@/lib/utils"
import type { JobCardData } from "@/components/dashboard/job-card"
import { KanbanCard } from "@/components/dashboard/kanban-card"

// The board's pipeline, left → right. ARCHIVED is intentionally omitted — it's a terminal
// "removed" state, not an active stage (mirrors the list view's filter tabs). Each column is
// color-coded from the shared status tokens (fill + foreground + dot) so a stage reads the
// same here as on a pill, and the colored header band makes the pipeline scannable at a
// glance. (Full literal classes so Tailwind's JIT emits them.)
type ColumnConfig = {
  status: JobStatus
  label: string
  fill: string
  fg: string
  dot: string
}

const COLUMNS: ColumnConfig[] = [
  {
    status: "SAVED",
    label: "Saved",
    fill: "bg-status-saved",
    fg: "text-status-saved-foreground",
    dot: "bg-status-saved-foreground",
  },
  {
    status: "APPLIED",
    label: "Applied",
    fill: "bg-status-applied",
    fg: "text-status-applied-foreground",
    dot: "bg-status-applied-foreground",
  },
  {
    status: "INTERVIEWING",
    label: "Interviewing",
    fill: "bg-status-interviewing",
    fg: "text-status-interviewing-foreground",
    dot: "bg-status-interviewing-foreground",
  },
  {
    status: "OFFER",
    label: "Offer",
    fill: "bg-status-offer",
    fg: "text-status-offer-foreground",
    dot: "bg-status-offer-foreground",
  },
  {
    status: "REJECTED",
    label: "Rejected",
    fill: "bg-status-rejected",
    fg: "text-status-rejected-foreground",
    dot: "bg-status-rejected-foreground",
  },
]

export function KanbanBoard({
  jobs,
  onMove,
}: {
  jobs: JobCardData[]
  /** Persist a card's new stage. The parent owns optimistic state + rollback. */
  onMove: (id: string, status: JobStatus) => void
}) {
  const router = useRouter()
  const [activeId, setActiveId] = useState<string | null>(null)
  // Set the moment a real drag starts; read (and cleared) by the click handler so the
  // pointer-up that ends a drag doesn't also navigate to the dropped job.
  const dragged = useRef(false)

  // A small activation distance lets a plain click through (to open the job) while still
  // making the whole card a drag handle. TouchSensor adds a short press delay so the board
  // can still be scrolled on touch without every touch grabbing a card.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )

  function handleDragStart(e: DragStartEvent) {
    dragged.current = true
    setActiveId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const next = over.id as JobStatus
    const from = active.data.current?.status as JobStatus | undefined
    if (next && next !== from) onMove(String(active.id), next)
  }

  function openJob(id: string) {
    // Swallow the click that immediately follows a drag; let genuine clicks navigate.
    if (dragged.current) {
      dragged.current = false
      return
    }
    router.push(`/dashboard/jobs/${id}`)
  }

  const byStatus = (status: JobStatus) => jobs.filter((j) => j.status === status)
  const activeJob = activeId ? jobs.find((j) => j.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {/* Break the board out of the dashboard's centered max-w-5xl container so it fills the
          full main area (viewport minus the 16rem sidebar, less a 4rem gutter). `left-1/2 +
          -translate-x-1/2` re-centers it in the main column regardless of the container width,
          giving all five stages room without a horizontal scrollbar. The hidden scrollbar keeps
          the (still-functional) overflow scroll clean on narrow screens. */}
      <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] md:relative md:left-1/2 md:w-[calc(100vw-16rem-4rem)] md:max-w-[calc(100vw-16rem-4rem)] md:-translate-x-1/2 [&::-webkit-scrollbar]:hidden">
        {COLUMNS.map((col) => (
          <Column
            key={col.status}
            col={col}
            jobs={byStatus(col.status)}
            onOpen={openJob}
          />
        ))}
      </div>

      {/* The lifted card under the cursor. No drop animation — the card has already been
          moved optimistically into its new column, so snapping the overlay back would jar. */}
      <DragOverlay dropAnimation={null}>
        {activeJob ? <KanbanCard job={activeJob} overlay className="w-[13rem]" /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  col,
  jobs,
  onOpen,
}: {
  col: ColumnConfig
  jobs: JobCardData[]
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status })

  return (
    <section className="flex min-w-[11rem] flex-1 flex-col">
      {/* Color-coded header band — the column's status fill + foreground make the stage
          legible at a glance; the count sits in a contrasting chip on the tint. */}
      <header
        className={cn(
          "mb-2.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5",
          col.fill,
          col.fg,
        )}
      >
        <span aria-hidden className={cn("size-2 rounded-full", col.dot)} />
        <h3 className="text-[13px] font-semibold tracking-tight">{col.label}</h3>
        <span className="ml-auto rounded-full bg-background/55 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
          {jobs.length}
        </span>
      </header>

      {/* Drop target. When a card hovers, the body adopts the column's own tint + a solid
          accent ring so it's obvious which stage you're dropping into. Vertical scrollbar is
          hidden (scroll still works) to keep the gutters between columns clean. */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex max-h-[calc(100vh-11rem)] min-h-[60vh] flex-1 flex-col gap-2.5 overflow-y-auto rounded-xl border border-dashed p-2 transition-colors [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          isOver
            ? cn(col.fill, col.fg, "border-transparent ring-2 ring-inset ring-current")
            : "border-border/60 bg-card/40",
        )}
      >
        {jobs.map((job) => (
          <DraggableCard key={job.id} job={job} onOpen={onOpen} />
        ))}
        {jobs.length === 0 && (
          <p className="m-auto select-none px-2 py-6 text-center text-xs text-muted-foreground/50">
            {isOver ? "Release to drop" : "Nothing here yet"}
          </p>
        )}
      </div>
    </section>
  )
}

function DraggableCard({
  job,
  onOpen,
}: {
  job: JobCardData
  onOpen: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    // Carry the source stage so drag-end can tell whether the card actually changed columns.
    data: { status: job.status },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(job.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          onOpen(job.id)
        }
      }}
      className={cn(
        "cursor-grab touch-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing",
        // Leave a faint placeholder where the card was while it rides in the overlay.
        isDragging && "opacity-40",
      )}
    >
      <KanbanCard job={job} />
    </div>
  )
}
