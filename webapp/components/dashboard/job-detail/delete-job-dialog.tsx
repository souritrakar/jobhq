"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { deleteJobRequest } from "@/lib/jobs/client"
import { Button } from "@/components/ui/button"

/**
 * Confirm-before-delete modal. On success it returns the user to the saved list (the deleted
 * job no longer exists, so staying on its page would 404). Dismisses on Escape/backdrop.
 */
export function DeleteJobDialog({
  open,
  onClose,
  jobId,
  jobTitle,
}: {
  open: boolean
  onClose: () => void
  jobId: string
  jobTitle: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, pending, onClose])

  if (!open) return null

  function confirm() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteJobRequest(jobId)
        router.push("/dashboard/saved")
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete this job")
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-foreground/30 motion-safe:animate-in motion-safe:fade-in-0"
        onClick={() => !pending && onClose()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className={cn(
          "relative w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-xl",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
        )}
      >
        <h2 id="delete-title" className="text-base font-semibold">
          Delete this job?
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{jobTitle}</span> and its captured
          application form will be removed. This can&apos;t be undone.
        </p>
        {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Delete job
          </Button>
        </div>
      </div>
    </div>
  )
}
