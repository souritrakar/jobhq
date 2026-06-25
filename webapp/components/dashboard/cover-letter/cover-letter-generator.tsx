"use client"

import { useMemo, useRef, useState } from "react"
import {
  Check,
  CircleAlert,
  Copy,
  Download,
  FileText,
  LoaderCircle,
  Printer,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { ResumeSummary } from "@/lib/resumes/types"
import {
  copyText,
  coverLetterFilename,
  downloadDocx,
  printPdf,
} from "@/lib/cover-letter/export"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { displayCompany } from "@/components/dashboard/logo-tile"
import { JobPicker, type JobOption } from "@/components/dashboard/cover-letter/job-picker"
import { ResumePicker } from "@/components/dashboard/cover-letter/resume-picker"

type Status = "idle" | "generating" | "done" | "error"

// Client-side backstop for a wedged stream. Longer than the server's 25s stall guard so the server
// normally ends the stream first; this only fires if the connection itself black-holes (server
// closed but the FIN never reaches us), so the UI can never spin "generating" forever.
const CLIENT_STALL_MS = 40_000
const STALLED = Symbol("stalled")

// One stream read that resolves to STALLED if no chunk arrives within CLIENT_STALL_MS.
function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array> | typeof STALLED> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(STALLED), CLIENT_STALL_MS)
    reader.read().then(
      (r) => {
        clearTimeout(timer)
        resolve(r)
      },
      () => {
        clearTimeout(timer)
        resolve({ done: true, value: undefined })
      },
    )
  })
}

// One-tap instruction presets — append to the free-text field rather than replacing it, so they
// compose (e.g. "Formal tone" + "Under 250 words").
const PRESETS = [
  "Keep it under 250 words.",
  "Use a warm, conversational tone.",
  "Use a formal, professional tone.",
  "Emphasize my most relevant, recent experience.",
]

export function CoverLetterGenerator({
  jobs: initialJobs,
  resumes,
  initialJobId,
  initialResumeId,
}: {
  jobs: JobOption[]
  resumes: ResumeSummary[]
  initialJobId?: string
  initialResumeId?: string
}) {
  const [jobs, setJobs] = useState<JobOption[]>(initialJobs)
  // Honor a deep-linked job (from a job's detail page) when it's a real option; otherwise fall
  // back to the first saved job so the generator is never empty-handed.
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    (initialJobId && initialJobs.some((j) => j.id === initialJobId) ? initialJobId : null) ??
      initialJobs[0]?.id ??
      null,
  )
  const [resumeId, setResumeId] = useState<string | null>(
    initialResumeId && resumes.some((r) => r.id === initialResumeId) ? initialResumeId : null,
  )
  const [instructions, setInstructions] = useState("")

  const [letter, setLetter] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null
  const isGenerating = status === "generating"
  const hasLetter = letter.trim().length > 0

  function addJob(job: JobOption) {
    setJobs((cur) => (cur.some((j) => j.id === job.id) ? cur : [job, ...cur]))
    setSelectedJobId(job.id)
  }

  async function generate() {
    if (!selectedJobId || isGenerating) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus("generating")
    setError(null)
    setLetter("")

    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJobId,
          resumeId: resumeId ?? undefined,
          instructions: instructions.trim() || undefined,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? "Something went wrong while generating. Please try again.")
        setStatus("error")
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""
      let stalled = false
      for (;;) {
        // Backstop to the server's own stall guard: if no bytes arrive for too long (e.g. the
        // connection black-holes after the server closed), stop waiting instead of spinning forever.
        const chunk = await readWithTimeout(reader)
        if (chunk === STALLED) {
          stalled = true
          await reader.cancel().catch(() => {})
          break
        }
        if (chunk.done) break
        acc += decoder.decode(chunk.value, { stream: true })
        setLetter(acc)
      }
      acc += decoder.decode()
      const text = acc.trim()
      setLetter(text)
      if (text) {
        // Partial-but-usable draft (incl. a stalled stream): keep it editable, flag a truncation.
        setStatus("done")
        setError(stalled ? "The AI service went quiet, so the letter may be cut short. You can edit it or regenerate." : null)
      } else {
        setStatus("error")
        setError(
          stalled
            ? "The AI service stopped responding. Please try again."
            : "The model returned an empty letter. Please try again.",
        )
      }
    } catch {
      if (controller.signal.aborted) {
        // User stopped — keep whatever streamed in as an editable draft.
        setStatus((prev) => (prev === "generating" ? "done" : prev))
        return
      }
      setError("We couldn't reach the server. Check your connection and try again.")
      setStatus("error")
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cover Letter</h1>
        <p className="text-sm text-muted-foreground">
          Generate a tailored, human-sounding cover letter for any saved job — then edit and export it.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        {/* ── Setup ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-background p-5">
          <Field label="Job">
            <JobPicker
              jobs={jobs}
              selectedId={selectedJobId}
              onSelect={setSelectedJobId}
              onAddJob={addJob}
            />
          </Field>

          <Field label="Resume" optional>
            <ResumePicker resumes={resumes} selectedId={resumeId} onSelect={setResumeId} />
          </Field>

          <Field label="Instructions" optional>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Emphasize my startup experience, keep it under 250 words, formal tone…"
              className="min-h-[76px]"
              rows={3}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() =>
                    setInstructions((cur) =>
                      cur.includes(preset) ? cur : (cur.trim() ? `${cur.trim()} ${preset}` : preset),
                    )
                  }
                  className="rounded-full border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {preset.replace(/\.$/, "")}
                </button>
              ))}
            </div>
          </Field>

          <Button
            type="button"
            size="lg"
            className="w-full justify-center gap-2"
            disabled={!selectedJobId || isGenerating}
            onClick={generate}
          >
            {isGenerating ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Generating…
              </>
            ) : hasLetter ? (
              <>
                <RotateCcw className="size-4" />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate cover letter
              </>
            )}
          </Button>
          {!selectedJobId && (
            <p className="-mt-3 text-center text-xs text-muted-foreground">
              Select a job to get started.
            </p>
          )}
        </div>

        {/* ── Output ──────────────────────────────────────────────────────── */}
        <OutputPanel
          status={status}
          error={error}
          letter={letter}
          isGenerating={isGenerating}
          job={selectedJob}
          onEdit={setLetter}
          onStop={stop}
          onRetry={generate}
        />
      </div>
    </div>
  )
}

function Field({
  label,
  optional,
  children,
}: {
  label: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {optional && <span className="text-xs text-muted-foreground">optional</span>}
      </div>
      {children}
    </div>
  )
}

function OutputPanel({
  status,
  error,
  letter,
  isGenerating,
  job,
  onEdit,
  onStop,
  onRetry,
}: {
  status: Status
  error: string | null
  letter: string
  isGenerating: boolean
  job: JobOption | null
  onEdit: (value: string) => void
  onStop: () => void
  onRetry: () => void
}) {
  const wordCount = useMemo(
    () => (letter.trim() ? letter.trim().split(/\s+/).length : 0),
    [letter],
  )
  const baseName = job
    ? coverLetterFilename(displayCompany(job.company) ?? job.company, job.title)
    : "Cover Letter"

  // Empty resting state before the first run — native to the column whitespace, not a boxed
  // container (no border/fill), so the two columns read as one calm composition.
  if (status === "idle" && !letter) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <FileText className="size-6" />
        </span>
        <p className="font-medium text-foreground">Your cover letter appears here</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Choose a job, add a resume if you have one, then generate. You can edit the result
          before exporting.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[420px] flex-col rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">Your cover letter</p>
          {isGenerating ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin text-primary" />
              Writing…
            </span>
          ) : letter ? (
            <span className="text-xs text-muted-foreground tabular-nums">{wordCount} words</span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {isGenerating ? (
            <ToolbarButton icon={<Square className="size-3.5 fill-current" />} label="Stop" onClick={onStop} />
          ) : (
            <ExportActions text={letter} baseName={baseName} disabled={!letter} />
          )}
        </div>
      </div>

      {status === "error" && !letter ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive">
            <CircleAlert className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">Couldn&apos;t generate the letter</p>
          <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" size="lg" className="mt-1 gap-2" onClick={onRetry}>
            <RotateCcw className="size-4" />
            Try again
          </Button>
        </div>
      ) : isGenerating && !letter ? (
        <StreamingSkeleton />
      ) : (
        <div className="flex flex-1 flex-col p-2">
          <Textarea
            value={letter}
            onChange={(e) => onEdit(e.target.value)}
            readOnly={isGenerating}
            spellCheck
            placeholder="Generating…"
            className={cn(
              "min-h-[360px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-[15px] leading-relaxed shadow-none",
              "font-serif focus-visible:ring-0",
            )}
          />
          {error && letter && (
            <p className="flex items-center gap-1.5 px-3 pb-1 text-xs text-destructive">
              <CircleAlert className="size-3.5" />
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Shown for the brief moment after "Generate" before the first token streams in — a calm set of
// shimmer lines (not a bare spinner), grouped like a letter's salutation + body + sign-off.
function StreamingSkeleton() {
  const lines = ["38%", "92%", "84%", "96%", "70%", null, "90%", "88%", "62%", null, "34%", "28%"]
  return (
    <div className="flex flex-1 flex-col gap-3.5 px-5 py-4" aria-hidden>
      {lines.map((width, i) =>
        width === null ? (
          <div key={i} className="h-2" />
        ) : (
          <div key={i} className="h-3 animate-pulse rounded-full bg-muted" style={{ width }} />
        ),
      )}
    </div>
  )
}

function ExportActions({
  text,
  baseName,
  disabled,
}: {
  text: string
  baseName: string
  disabled: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await copyText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard denied — nothing actionable; the export buttons still work.
    }
  }

  return (
    <>
      <ToolbarButton
        icon={copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
        label={copied ? "Copied" : "Copy"}
        onClick={handleCopy}
        disabled={disabled}
      />
      <ToolbarButton
        icon={<Download className="size-3.5" />}
        label=".docx"
        onClick={() => downloadDocx(text, baseName)}
        disabled={disabled}
      />
      <ToolbarButton
        icon={<Printer className="size-3.5" />}
        label="PDF"
        onClick={() => printPdf(text, baseName)}
        disabled={disabled}
      />
    </>
  )
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {icon}
      {label}
    </button>
  )
}
