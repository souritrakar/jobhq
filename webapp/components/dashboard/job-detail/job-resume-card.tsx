"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  LoaderCircle,
  Sparkles,
  Upload,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { patchJob } from "@/lib/jobs/client"
import { uploadDocument } from "@/lib/documents/client"
import type { ClientDocument } from "@/lib/documents/types"
import type { ResumeSummary } from "@/lib/resumes/types"
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_LABEL,
  fileExtension,
  validateDocumentFile,
} from "@/lib/validations/document"
import { buttonVariants } from "@/components/ui/button"
import { Menu } from "./menu"

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
    // A just-extracted upload: assume readable; the next server render reconciles the real status.
    textReady: true,
  }
}

/**
 * Pick the resume to tailor THIS job's application — the document whose text feeds the cover-letter
 * and (later) answer-drafting features. The choice is persisted on the job (PATCH `resumeDocumentId`)
 * so it's chosen once and reused, never re-uploaded or re-parsed. New resumes can be uploaded inline.
 */
export function JobResumeCard({
  jobId,
  resumes,
  selectedId,
}: {
  jobId: string
  resumes: ResumeSummary[]
  selectedId: string | null
}) {
  const router = useRouter()
  const [items, setItems] = useState<ResumeSummary[]>(resumes)
  const [selected, setSelected] = useState<string | null>(selectedId)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const current = items.find((r) => r.id === selected) ?? null

  // Persist a selection (or null to clear), optimistically. Revert on failure so the UI never
  // claims a choice the server rejected.
  function choose(id: string | null) {
    if (id === selected) return
    const prev = selected
    setSelected(id)
    setError(null)
    startTransition(async () => {
      try {
        await patchJob(jobId, { resumeDocumentId: id })
        router.refresh()
      } catch (e) {
        setSelected(prev)
        setError(e instanceof Error ? e.message : "Couldn't save your selection.")
      }
    })
  }

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
      choose(summary.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  const unreadable = current?.textReady === false
  const busy = pending || uploading

  return (
    <div className="flex flex-col gap-2.5">
      <Menu
        align="start"
        panelClassName="right-0 mt-1.5"
        renderTrigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            disabled={busy}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md border bg-background px-2.5 py-2 text-left transition-colors",
              "hover:border-input hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-70",
              current ? "border-border" : "border-dashed border-input",
            )}
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-[30%]",
                current ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileText className="size-[18px]" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              {current ? (
                <>
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {current.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {current.headline}
                  </span>
                </>
              ) : (
                <span className="block text-[13px] text-muted-foreground">Select a resume…</span>
              )}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      >
        {({ close }) => (
          <div className="flex flex-col">
            {items.length > 0 && (
              <div className="flex flex-col">
                {items.map((resume) => {
                  const active = resume.id === selected
                  return (
                    <button
                      key={resume.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        choose(active ? null : resume.id)
                        close()
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          {resume.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {resume.headline}
                          {resume.textReady === false && " · unreadable"}
                        </span>
                      </span>
                      {active && <Check className="size-3.5 shrink-0 text-primary" strokeWidth={3} />}
                    </button>
                  )
                })}
              </div>
            )}

            {(items.length > 0 || selected) && <div className="my-1 h-px bg-border" />}

            <button
              type="button"
              onClick={() => {
                close()
                fileRef.current?.click()
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground outline-none"
            >
              <Upload className="size-3.5 shrink-0 opacity-80" />
              Upload a resume
            </button>

            {selected && (
              <button
                type="button"
                onClick={() => {
                  choose(null)
                  close()
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground outline-none"
              >
                <X className="size-3.5 shrink-0 opacity-80" />
                Remove selection
              </button>
            )}
          </div>
        )}
      </Menu>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files)}
      />

      {error ? (
        <p className="flex items-start gap-1.5 text-[13px] text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : unreadable ? (
        <p className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          <span>We couldn&apos;t read text from this file — a PDF or DOCX gives tailored output.</span>
        </p>
      ) : !current && items.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Upload a resume ({ALLOWED_LABEL}) to tailor your cover letter and answers to it.
        </p>
      ) : (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Used to tailor your cover letter and application answers for this job.
        </p>
      )}

      <Link
        href={{
          pathname: "/dashboard/resume/cover-letter",
          query: { jobId, ...(selected ? { resumeId: selected } : {}) },
        }}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full justify-center gap-1.5",
        )}
      >
        <Sparkles className="size-3.5" />
        Generate cover letter
      </Link>
    </div>
  )
}
