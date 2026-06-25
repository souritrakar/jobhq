"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { patchJob } from "@/lib/jobs/client"
import { Button } from "@/components/ui/button"

/**
 * Inline notes for a job — a private scratchpad ("recruiter is X", "referred by Y"). Reads from
 * the server-rendered value, edits in place, and PATCHes `notes` on save (empty clears it).
 */
export function NotesEditor({ jobId, notes }: { jobId: string; notes: string | null }) {
  const router = useRouter()
  const [value, setValue] = useState(notes ?? "")
  const [saved, setSaved] = useState(notes ?? "")
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    const next = value.trim()
    setError(null)
    startTransition(async () => {
      try {
        await patchJob(jobId, { notes: next || null })
        setSaved(next)
        setValue(next)
        setEditing(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your note")
      }
    })
  }

  function cancel() {
    setValue(saved)
    setEditing(false)
    setError(null)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          autoFocus
          rows={4}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a private note…"
          className={cn(
            "w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-[13px] leading-relaxed shadow-xs transition-colors",
            "placeholder:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
          )}
        />
        {error && <p className="text-[11.5px] text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="xs" onClick={cancel} disabled={pending}>
            Cancel
          </Button>
          <Button size="xs" onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-3 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    )
  }

  if (!saved) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-input bg-background/40 px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/30 hover:text-foreground"
      >
        <Plus className="size-3.5" />
        Add a private note
      </button>
    )
  }

  return (
    <div className="group/notes flex flex-col gap-1.5">
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">{saved}</p>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Pencil className="size-3" />
        Edit note
      </button>
    </div>
  )
}
