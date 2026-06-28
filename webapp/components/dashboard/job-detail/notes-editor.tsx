"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Loader2, NotebookPen, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { patchJob } from "@/lib/jobs/client"
import { Button } from "@/components/ui/button"

// Past this rendered height the inline panel would grow taller than the resume section beside it,
// so we collapse the note to a fading preview and push full editing into the modal.
const COLLAPSE_AT = 384

const PLACEHOLDER = "Jot down anything — recruiter, referral, follow-ups…"

/**
 * Inline notes for a job — a private scratchpad ("recruiter is X", "referred by Y"). Notion-style:
 * the textarea is always live, so you can drop in and type whenever. Short notes edit in place; once
 * a note grows past the panel's comfortable height it collapses to a faded preview with a "View
 * more" button that opens a roomy, near-full-page editor modal. All surfaces share one piece of
 * state, so an edit in the modal is the same edit as inline. Saving PATCHes `notes` (empty clears).
 */
export function NotesEditor({ jobId, notes }: { jobId: string; notes: string | null }) {
  const router = useRouter()
  const [value, setValue] = useState(notes ?? "")
  const [saved, setSaved] = useState(notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const [focused, setFocused] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const inlineRef = useRef<HTMLTextAreaElement>(null)

  const dirty = value.trim() !== saved
  // Collapse only when idle (not focused, no unsaved edits) so typing never gets interrupted.
  const collapsed =
    !modalOpen && !focused && !dirty && saved.length > 0 && contentHeight > COLLAPSE_AT

  // Auto-grow the inline field to its content, then cap it when collapsed so the panel stays put.
  useLayoutEffect(() => {
    const el = inlineRef.current
    if (!el) return
    el.style.height = "auto"
    const h = el.scrollHeight
    setContentHeight(h)
    const cap = !modalOpen && !focused && !dirty && saved.length > 0 && h > COLLAPSE_AT
    el.style.height = `${cap ? COLLAPSE_AT : h}px`
  }, [value, focused, dirty, modalOpen, saved])

  useEffect(() => {
    if (!dirty) return
    setJustSaved(false)
  }, [dirty])

  const save = useCallback(() => {
    const next = value.trim()
    setError(null)
    startTransition(async () => {
      try {
        await patchJob(jobId, { notes: next || null })
        setSaved(next)
        setValue(next)
        setJustSaved(true)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your note")
      }
    })
  }, [jobId, router, value])

  function discard() {
    setValue(saved)
    setError(null)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty) {
      e.preventDefault()
      save()
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div
          className={cn("relative", collapsed && "cursor-pointer")}
          onClick={collapsed ? () => setModalOpen(true) : undefined}
        >
          <textarea
            ref={inlineRef}
            rows={2}
            value={value}
            readOnly={collapsed}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            placeholder={PLACEHOLDER}
            aria-label="Notes"
            className={cn(
              // Notion-document feel: no box, no border, no focus ring — just text on the card.
              "w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed text-foreground",
              "min-h-[3rem] overflow-hidden",
              "placeholder:text-muted-foreground/60",
              "outline-none focus:outline-none focus-visible:outline-none focus:ring-0",
              // When collapsed the whole area is a single click target (opens the modal), so let
              // clicks fall through to the wrapper instead of landing in the read-only field.
              collapsed && "pointer-events-none cursor-pointer",
            )}
          />

          {collapsed && (
            // Fade the clipped text into the panel and float a "View more" control over it.
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-24 items-end justify-start bg-gradient-to-t from-fern-50 via-fern-50/85 to-transparent">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setModalOpen(true)
                }}
                className="pointer-events-auto inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-fern-700 transition-colors hover:text-fern-600"
              >
                View more
                <ChevronDown className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {!collapsed && error && (
          <p className="px-1 text-[11.5px] text-destructive">{error}</p>
        )}

        {!collapsed && dirty && (
          <SaveBar pending={pending} onDiscard={discard} onSave={save} />
        )}

        {!collapsed && !dirty && justSaved && <SavedHint />}
      </div>

      {modalOpen && (
        <NotesModal
          value={value}
          dirty={dirty}
          pending={pending}
          error={error}
          justSaved={justSaved}
          onChange={setValue}
          onKeyDown={onKeyDown}
          onDiscard={discard}
          onSave={save}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

/** The save bar — slides up only when there are unsaved edits. Shared by the inline panel + modal. */
function SaveBar({
  pending,
  onDiscard,
  onSave,
}: {
  pending: boolean
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-fern-100 pt-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-150">
      <span className="px-1 text-[11.5px] text-muted-foreground">Unsaved changes</span>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="xs" onClick={onDiscard} disabled={pending}>
          Discard
        </Button>
        <Button size="xs" onClick={onSave} disabled={pending}>
          {pending && <Loader2 className="size-3 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  )
}

function SavedHint() {
  return (
    <p className="flex items-center gap-1 px-1 text-[11.5px] font-medium text-fern-700 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
      <Check className="size-3" />
      Saved
    </p>
  )
}

/**
 * The near-full-page Notes editor. A calm "Notes" header, a generous document-style writing surface
 * (same Notion-like, chrome-free textarea as inline), and a sticky save bar. Locks page scroll,
 * dismisses on Escape / backdrop, and focuses the field with the cursor at the end on open.
 */
function NotesModal({
  value,
  dirty,
  pending,
  error,
  justSaved,
  onChange,
  onKeyDown,
  onDiscard,
  onSave,
  onClose,
}: {
  value: string
  dirty: boolean
  pending: boolean
  error: string | null
  justSaved: boolean
  onChange: (next: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onDiscard: () => void
  onSave: () => void
  onClose: () => void
}) {
  const editorRef = useRef<HTMLTextAreaElement>(null)

  // Lock background scroll while the modal owns the viewport.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Escape closes (unless mid-save).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [pending, onClose])

  // Focus the field with the cursor at the end so the user can keep writing immediately.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [])

  // Auto-grow the document field; the modal body scrolls when the note runs long.
  useLayoutEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-foreground/30 motion-safe:animate-in motion-safe:fade-in-0"
        onClick={() => !pending && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-modal-title"
        className={cn(
          "relative flex w-full flex-col overflow-hidden bg-background shadow-xl",
          "h-full rounded-none sm:h-[88vh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-border",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
          "motion-safe:slide-in-from-bottom-4 sm:motion-safe:zoom-in-95 sm:motion-safe:slide-in-from-bottom-0",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-7">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <NotebookPen className="size-[17px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="notes-modal-title"
              className="text-[15px] font-semibold leading-tight tracking-tight text-foreground"
            >
              Notes
            </h2>
            <p className="text-[11.5px] leading-tight text-muted-foreground">Private to you</p>
          </div>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            aria-label="Close notes"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <X className="size-[18px]" />
          </button>
        </div>

        {/* Document writing surface */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <textarea
            ref={editorRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={PLACEHOLDER}
            aria-label="Notes"
            className={cn(
              "mx-auto block w-full max-w-3xl resize-none border-0 bg-transparent p-0",
              "min-h-[50vh] overflow-hidden text-[15.5px] leading-[1.7] text-foreground",
              "placeholder:text-muted-foreground/60",
              "outline-none focus:outline-none focus-visible:outline-none focus:ring-0",
            )}
          />
        </div>

        {/* Footer / save bar */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5 sm:px-7">
          <div className="min-w-0 text-[12px] text-muted-foreground">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : dirty ? (
              <span>Unsaved changes</span>
            ) : justSaved ? (
              <span className="flex items-center gap-1 font-medium text-fern-700">
                <Check className="size-3.5" />
                Saved
              </span>
            ) : (
              <span className="hidden sm:inline">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-medium">
                  ⌘
                </kbd>
                <span className="px-0.5">+</span>
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-medium">
                  ↵
                </kbd>
                <span className="ml-1.5">to save</span>
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={onDiscard} disabled={pending}>
                Discard
              </Button>
            )}
            <Button size="sm" onClick={dirty ? onSave : onClose} disabled={pending}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {dirty ? "Save changes" : "Done"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
