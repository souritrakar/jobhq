"use client"

import { useRef, useState } from "react"
import { Check, CircleAlert, FileText, Info, LoaderCircle, Upload } from "lucide-react"

import { cn } from "@/lib/utils"
import { uploadDocument } from "@/lib/documents/client"
import type { ClientDocument } from "@/lib/documents/types"
import type { ResumeSummary } from "@/lib/resumes/types"
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_LABEL,
  fileExtension,
  validateDocumentFile,
} from "@/lib/validations/document"

const ACCEPT = ALLOWED_EXTENSIONS.join(",")

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

// Map a freshly-uploaded document to the picker's summary shape — mirrors the server's
// toResumeSummary so an upload looks identical to a server-rendered row.
function toSummary(doc: ClientDocument): ResumeSummary {
  const ext = fileExtension(doc.fileName).replace(".", "").toUpperCase()
  return {
    id: doc.id,
    name: doc.title,
    headline: [ext || "FILE", formatBytes(doc.size)].join(" · "),
    updatedAt: new Date(doc.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  }
}

/**
 * Resume selection for the cover-letter generator. Lists the user's uploaded documents (resumes,
 * cover letters, …) as a single-select list on one hairline-divided surface, with a quiet "Upload"
 * row at the foot. Uploads go straight to the real documents store (R2) via the shared client, so a
 * newly uploaded resume is immediately a first-class, parseable selection — not a session stub.
 *
 * A resume is mandatory: the parent preselects one on load, and selecting a row only ever switches
 * the choice (never clears it). When the user has no documents at all, the list is empty and the
 * upload row below is the only path forward.
 */
export function ResumePicker({
  resumes,
  selectedId,
  onSelect,
}: {
  resumes: ResumeSummary[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const [items, setItems] = useState<ResumeSummary[]>(resumes)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(files: FileList | null) {
    const file = files?.[0]
    if (fileRef.current) fileRef.current.value = "" // allow re-selecting the same file
    if (!file) return

    const problem = validateDocumentFile({ name: file.name, size: file.size })
    if (problem) {
      setError(problem)
      return
    }

    setError(null)
    setUploading(true)
    try {
      const doc = await uploadDocument(file)
      const summary = toSummary(doc)
      setItems((cur) => [summary, ...cur])
      onSelect(summary.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* One surface, rows separated by hairlines — not a stack of bordered cards. The selected
          row carries a faint fern wash (no heavy border); "Upload" is a quiet ghost row at the
          foot of the same list rather than a separate button. */}
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
        {items.map((resume) => {
          const active = resume.id === selectedId
          return (
            <button
              key={resume.id}
              type="button"
              onClick={() => onSelect(resume.id)}
              aria-pressed={active}
              className={cn(
                "group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                active ? "bg-primary/5" : "hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-[30%]",
                  active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <FileText className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {resume.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {resume.headline} · Updated {resume.updatedAt}
                </span>
              </span>
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input text-transparent group-hover:border-muted-foreground/40",
                )}
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-[30%] border border-dashed border-input text-muted-foreground">
            {uploading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
          </span>
          {uploading ? "Uploading…" : "Upload a resume"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => void handleFile(e.target.files)}
        />
      </div>

      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : items.length === 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          <span>
            No resumes yet — upload one ({ALLOWED_LABEL}) to generate a cover letter.
          </span>
        </p>
      ) : !selectedId ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          <span>Select a resume to continue.</span>
        </p>
      ) : null}
    </div>
  )
}
