"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { CircleAlert, LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { saveAnswers } from "@/lib/application/client"
import { ApplicationField } from "./application-field"
import type { StoredQuestion } from "./questions"

/**
 * Owns the application form's answer state and its single manual save.
 *
 * Every text field is controlled from here: `draft` holds the working values, `baseline` holds the
 * last saved ones, and the difference is the set of unsaved changes. Nothing autosaves — editing (or
 * an AI draft) only mutates `draft`; the user commits the whole form at once via the bottom save
 * bar, which sends just the changed answers in ONE request. This keeps writes to one transaction per
 * Save (cheap + scalable) and makes persistence explicit and visible instead of a silent background
 * autosave. A `beforeunload` guard protects unsaved work.
 */
export function ApplicationAnswers({
  questions,
  jobId,
  hasResume,
  initialAnswers,
}: {
  questions: StoredQuestion[]
  jobId: string
  hasResume: boolean
  /** The answers persisted for this job, keyed by question id — the starting baseline. */
  initialAnswers: Record<string, string>
}) {
  const [baseline, setBaseline] = useState<Record<string, string>>(initialAnswers)
  const [draft, setDraft] = useState<Record<string, string>>(initialAnswers)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The question ids whose working value differs from the last saved one. Treat absent and "" alike
  // so clearing a field back to empty (when it was never saved) isn't counted as a change.
  const dirtyIds = useMemo(() => {
    const ids = new Set([...Object.keys(draft), ...Object.keys(baseline)])
    const out: string[] = []
    for (const id of ids) {
      if ((draft[id] ?? "") !== (baseline[id] ?? "")) out.push(id)
    }
    return out
  }, [draft, baseline])
  const dirty = dirtyIds.length > 0

  function setValue(id: string, next: string) {
    setDraft((d) => ({ ...d, [id]: next }))
    setError(null)
  }

  function cancel() {
    setDraft(baseline)
    setError(null)
  }

  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    const committed = draft // snapshot: what we're about to persist
    try {
      await saveAnswers(
        jobId,
        dirtyIds.map((id) => ({ questionId: id, value: committed[id] ?? "" })),
      )
      // The snapshot is now the source of truth. Edits made during the save stay dirty against it.
      setBaseline(committed)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your changes. Try again.")
    } finally {
      setSaving(false)
    }
  }

  // Manual-save safety net: warn before leaving (reload/close/navigate) with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  return (
    <>
      <div className="flex flex-col gap-7 p-5 sm:p-6">
        {questions.map((q) => (
          <ApplicationField
            key={q.id}
            question={q}
            jobId={jobId}
            hasResume={hasResume}
            value={draft[q.id] ?? ""}
            onChange={(next) => setValue(q.id, next)}
            dirty={dirtyIds.includes(q.id)}
          />
        ))}
      </div>

      <SaveBar
        visible={dirty}
        count={dirtyIds.length}
        saving={saving}
        error={error}
        onCancel={cancel}
        onSave={save}
      />
    </>
  )
}

/**
 * The sticky save bar, portaled to the body so it floats above the page wherever the user has
 * scrolled. Always mounted; it slides in/out on `visible` so both enter and exit animate. Motion is
 * dropped under `prefers-reduced-motion`.
 */
function SaveBar({
  visible,
  count,
  saving,
  error,
  onCancel,
  onSave,
}: {
  visible: boolean
  count: number
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: () => void
}) {
  // Portal target, resolved once. Null during SSR (no document) so the bar renders nothing on the
  // server and mounts straight into the body on the client — no setState-in-effect needed.
  const [container] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.body,
  )
  if (!container) return null

  return createPortal(
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 transition-all duration-300 ease-out motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div className="flex w-full max-w-xl items-center gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {error ? (
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-destructive">
            <CircleAlert className="size-4 shrink-0" />
            <span className="truncate">{error}</span>
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{count}</span>{" "}
            unsaved {count === 1 ? "change" : "changes"}
          </p>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <>
              <LoaderCircle className="size-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </div>,
    document.body,
  )
}
