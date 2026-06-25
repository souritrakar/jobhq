"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import type { JobStatus } from "@prisma/client"

import { cn } from "@/lib/utils"
import { patchJob } from "@/lib/jobs/client"
import { StatusPill } from "@/components/dashboard/status-pill"
import { Menu } from "./menu"

// Pipeline order — the natural progression a job moves through, with the two terminal/off-track
// states last. Drives the menu list.
const STATUS_ORDER: JobStatus[] = [
  "SAVED",
  "APPLIED",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "ARCHIVED",
]

/**
 * The job's pipeline status as the primary action: a pill that opens a menu to move the job to
 * another stage. Optimistic — the pill updates immediately, then PATCHes and refreshes the
 * server component; on failure it reverts and surfaces the error inline.
 */
export function StatusMenu({
  jobId,
  status,
  size = "default",
}: {
  jobId: string
  status: JobStatus
  size?: "default" | "sm"
}) {
  const router = useRouter()
  const [optimistic, setOptimistic] = useState(status)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function change(next: JobStatus, close: () => void) {
    close()
    if (next === optimistic) return
    const previous = optimistic
    setOptimistic(next)
    setError(null)
    startTransition(async () => {
      try {
        await patchJob(jobId, { status: next })
        router.refresh()
      } catch (e) {
        setOptimistic(previous)
        setError(e instanceof Error ? e.message : "Couldn't update status")
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Menu
        renderTrigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="menu"
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-background transition-colors hover:border-input hover:bg-muted",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
              size === "sm" ? "py-0.5 pl-1 pr-2" : "py-1 pl-1.5 pr-2.5",
            )}
          >
            <StatusPill status={optimistic} />
            {pending ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : (
              <ChevronDown
                className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
              />
            )}
          </button>
        )}
      >
        {({ close }) => (
          <>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={() => change(s, close)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted"
              >
                <StatusPill status={s} className="flex-1" />
                {s === optimistic && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            ))}
          </>
        )}
      </Menu>
      {error && <p className="text-[11.5px] text-destructive">{error}</p>}
    </div>
  )
}
