"use client"

import { useCallback, useEffect, useRef } from "react"
import type { JobStatus } from "@prisma/client"

import { patchJobStatuses } from "@/lib/jobs/client"

// How long the board sits idle before a batch of moves is written. Rapid drags within this window
// collapse into a single request, so spamming a card around costs one round trip, not one per drop.
const DEBOUNCE_MS = 1000

export type StatusSeed = { id: string; status: JobStatus }

/**
 * Batches and debounces Kanban status changes into cheap, durable DB writes.
 *
 * The caller owns the visible board state and updates it optimistically; this hook owns only the
 * *persistence*. It tracks, per job, the stage last known to be saved, and queues a write only when
 * a card's stage actually differs from that — so a card dragged out and back to its original column
 * costs zero writes.
 *
 * Pending changes are flushed:
 *   - after {@link DEBOUNCE_MS} of inactivity (the common case),
 *   - when the tab is hidden or the page is being unloaded (`visibilitychange` / `pagehide`), using
 *     a `keepalive` request so the final position survives a tab close,
 *   - on unmount (e.g. client-side navigation away from the board).
 *
 * A hard crash / power loss can still lose the moves made in the last ~1s — that's unrecoverable by
 * any client, and the debounce keeps the window that small.
 *
 * On a failed save the saved-baseline is rolled back and `onError` is called with the affected
 * cards' last-saved stages, so the caller can revert those rows to match the database.
 *
 * @returns `queue(id, next)` — record a card's latest target stage.
 */
export function useStatusSync(
  seed: StatusSeed[],
  onError: (restore: StatusSeed[]) => void,
): (id: string, next: JobStatus) => void {
  // Stage we believe is persisted, per job. Advances on a successful flush, reverts on failure.
  const saved = useRef<Map<string, JobStatus>>(
    new Map(seed.map((s) => [s.id, s.status])),
  )
  // Jobs whose current stage differs from `saved` and isn't written yet (latest target wins).
  const pending = useRef<Map<string, JobStatus>>(new Map())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latest onError, read without re-subscribing the unload listeners on every render.
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const flush = useCallback((keepalive = false) => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (pending.current.size === 0) return

    const changes = Array.from(pending.current, ([id, status]) => ({ id, status }))
    pending.current.clear()

    // Optimistically advance the baseline; remember the prior stage so we can revert on failure.
    const prior = changes.map((c) => ({ id: c.id, status: saved.current.get(c.id) }))
    for (const c of changes) saved.current.set(c.id, c.status)

    patchJobStatuses(changes, { keepalive }).catch(() => {
      const restore: StatusSeed[] = []
      for (const p of prior) {
        if (p.status === undefined) saved.current.delete(p.id)
        else {
          saved.current.set(p.id, p.status)
          restore.push({ id: p.id, status: p.status })
        }
      }
      if (restore.length > 0) onErrorRef.current(restore)
    })
  }, [])

  const queue = useCallback(
    (id: string, next: JobStatus) => {
      // Back to the saved stage ⇒ nothing to persist; otherwise record the latest target.
      if (saved.current.get(id) === next) pending.current.delete(id)
      else pending.current.set(id, next)

      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => flush(false), DEBOUNCE_MS)
    },
    [flush],
  )

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush(true)
    }
    const onPageHide = () => flush(true)
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", onPageHide)
      flush(false) // unmount: persist anything still pending
    }
  }, [flush])

  return queue
}
