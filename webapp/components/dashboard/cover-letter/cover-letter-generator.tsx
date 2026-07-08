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
import { drainEvents, type ProgressPhase } from "@/lib/cover-letter/progress"
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

// Hard cap on the free-text instructions, shown live to the user and mirrored by the server's Zod
// validation (lib/validations/cover-letter.ts). Bounds the one untrusted free-text input.
const INSTRUCTIONS_MAX = 2000

// The server first runs the INPUT GATES (validation, résumé, safety + intent classifiers) — which can
// reject the request — and only then opens the stream and starts the generator. So the client shows a
// GENERIC "getting ready" state during the gate phase ("checking", client-only) and only switches to
// the cover-letter-specific "Drafting…" message once the server's first `drafting` event actually
// arrives (i.e. we're truly generating). The later phases come straight from the pipeline's events.
type ClientPhase = "checking" | ProgressPhase

const PHASE_MESSAGES: Record<ClientPhase, string> = {
  checking: "Getting things ready…",
  drafting: "Drafting your cover letter…",
  reviewing: "Checking quality and fit…",
  polishing: "Polishing the final draft…",
}

const DEFAULT_ERROR = "We couldn't draft your letter right now. Please try again."
const STALL_ERROR = "This is taking longer than expected. Please try again."

// Error codes that mean "your input was rejected by a guardrail" (safety/intent/validation) or "the
// output didn't pass a policy check" — re-running the SAME input reproduces them, so we don't offer a
// "Try again". Everything else (rate limit, timeout, generic API/network failure) is transient and
// retryable as-is. BAD_REQUEST covers the pre-stream input gates (moderation, intent, résumé,
// validation); UNCLEAN/SAFETY are the mid-pipeline policy blocks.
const POLICY_ERROR_CODES = new Set(["BAD_REQUEST", "UNCLEAN", "SAFETY"])

function isRetryableCode(code?: string | null): boolean {
  return !code || !POLICY_ERROR_CODES.has(code)
}

function phaseMessage(phase: ClientPhase | null): string {
  return phase ? PHASE_MESSAGES[phase] : "Working…"
}

// True once the server has actually started generating (first `drafting` event seen) — i.e. all input
// gates passed. Before that we're still in the pre-generation "checking" state.
function isGeneratingLetter(phase: ClientPhase | null): boolean {
  return phase !== null && phase !== "checking"
}

// A resume is mandatory, so the generator opens with one preselected: a deep-linked resume when
// valid, otherwise the latest readable upload (the list is newest-first; skip files we couldn't
// extract text from), otherwise the newest of whatever exists. Null only when the user has no
// documents at all — which gates generation behind an upload.
function pickDefaultResumeId(resumes: ResumeSummary[], initialResumeId?: string): string | null {
  if (initialResumeId && resumes.some((r) => r.id === initialResumeId)) return initialResumeId
  return resumes.find((r) => r.textReady !== false)?.id ?? resumes[0]?.id ?? null
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
    pickDefaultResumeId(resumes, initialResumeId),
  )
  const [instructions, setInstructions] = useState("")

  // The user has nothing to select — generation is gated behind uploading a resume. (Once they
  // upload one in the picker it calls onSelect, so resumeId becomes set and the gate lifts.)
  const hasNoResumes = resumes.length === 0

  const [letter, setLetter] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [phase, setPhase] = useState<ClientPhase | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Whether the current error is worth a straight retry (transient: network/rate-limit/timeout/api)
  // vs a POLICY block (safety/intent/refusal/validation), where re-running the same input just fails
  // again — those show no "Try again", guiding the user to edit their instructions instead.
  const [errorRetryable, setErrorRetryable] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null
  const isGenerating = status === "generating"
  const hasLetter = letter.trim().length > 0

  // Set the error state, tagging whether a plain retry makes sense.
  function showError(message: string, retryable: boolean) {
    setError(message)
    setErrorRetryable(retryable)
    setStatus("error")
  }

  function addJob(job: JobOption) {
    setJobs((cur) => (cur.some((j) => j.id === job.id) ? cur : [job, ...cur]))
    setSelectedJobId(job.id)
  }

  async function generate() {
    if (!selectedJobId || !resumeId || isGenerating) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus("generating")
    setError(null)
    setLetter("")
    // Pre-generation: the server runs the input gates first. Show a GENERIC "getting ready" state, not
    // "Drafting…", until the server's first `drafting` event confirms generation has actually begun.
    setPhase("checking")

    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJobId,
          resumeId,
          instructions: instructions.trim() || undefined,
        }),
        signal: controller.signal,
      })

      // A pre-stream failure comes back as the standard JSON `{ error }` envelope. A BAD_REQUEST is a
      // guardrail/validation block (safety, off-task intent, unreadable résumé) — not retryable as-is;
      // anything else (rate limit, internal) is transient.
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        showError(body?.error?.message ?? DEFAULT_ERROR, isRetryableCode(body?.error?.code))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let stalled = false
      let sawTerminal = false

      outer: for (;;) {
        // Backstop to the server's own stall guard: if no events arrive for too long (e.g. the
        // connection black-holes after the server closed), stop waiting instead of spinning forever.
        const chunk = await readWithTimeout(reader)
        if (chunk === STALLED) {
          stalled = true
          await reader.cancel().catch(() => {})
          break
        }
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })

        const { events, rest } = drainEvents(buffer)
        buffer = rest
        for (const ev of events) {
          if (ev.t === "status") {
            setPhase(ev.phase)
          } else if (ev.t === "letter") {
            // The one, fully-vetted artifact. Reveal it and we're done.
            setLetter(ev.text)
            setError(null)
            setStatus("done")
            sawTerminal = true
            await reader.cancel().catch(() => {})
            break outer
          } else if (ev.t === "error") {
            // A clean, specific, server-mapped message. Policy blocks (UNCLEAN/SAFETY) aren't
            // retryable as-is; transient ones (rate limit, timeout, generation failed) are.
            showError(ev.message, isRetryableCode(ev.code))
            sawTerminal = true
            await reader.cancel().catch(() => {})
            break outer
          }
        }
      }

      // User pressed Stop — the letter arrives whole, so there's nothing partial to keep; reset.
      if (controller.signal.aborted) {
        setStatus((prev) => (prev === "generating" ? "idle" : prev))
        return
      }

      // Stream ended without a terminal event (a stall or a black-holed connection) — transient.
      if (!sawTerminal) {
        showError(stalled ? STALL_ERROR : DEFAULT_ERROR, true)
      }
    } catch {
      if (controller.signal.aborted) {
        setStatus((prev) => (prev === "generating" ? "idle" : prev))
        return
      }
      showError("We couldn't reach the server. Check your connection and try again.", true)
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

          <Field label="Resume">
            <ResumePicker resumes={resumes} selectedId={resumeId} onSelect={setResumeId} />
          </Field>

          <Field label="Instructions" optional>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value.slice(0, INSTRUCTIONS_MAX))}
              maxLength={INSTRUCTIONS_MAX}
              placeholder="e.g. Emphasize my startup experience, keep it under 250 words, formal tone…"
              className="min-h-[76px]"
              rows={3}
            />
            <div className="mt-1 flex justify-end">
              <span
                className={cn(
                  "text-xs tabular-nums",
                  instructions.length >= INSTRUCTIONS_MAX
                    ? "text-destructive"
                    : instructions.length > INSTRUCTIONS_MAX - 100
                      ? "text-amber-600"
                      : "text-muted-foreground",
                )}
              >
                {instructions.length}/{INSTRUCTIONS_MAX}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() =>
                    setInstructions((cur) =>
                      cur.includes(preset)
                        ? cur
                        : (cur.trim() ? `${cur.trim()} ${preset}` : preset).slice(0, INSTRUCTIONS_MAX),
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
            disabled={!selectedJobId || !resumeId || isGenerating}
            onClick={generate}
          >
            {isGenerating ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {isGeneratingLetter(phase) ? "Generating…" : "Getting ready…"}
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
          {!selectedJobId ? (
            <p className="-mt-3 text-center text-xs text-muted-foreground">
              Select a job to get started.
            </p>
          ) : !resumeId ? (
            <p className="-mt-3 text-center text-xs text-muted-foreground">
              {hasNoResumes
                ? "Upload a resume to generate a cover letter."
                : "Select a resume to continue."}
            </p>
          ) : null}
        </div>

        {/* ── Output ──────────────────────────────────────────────────────── */}
        <OutputPanel
          status={status}
          error={error}
          errorRetryable={errorRetryable}
          letter={letter}
          isGenerating={isGenerating}
          phase={phase}
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
  errorRetryable,
  letter,
  isGenerating,
  phase,
  job,
  onEdit,
  onStop,
  onRetry,
}: {
  status: Status
  error: string | null
  errorRetryable: boolean
  letter: string
  isGenerating: boolean
  phase: ClientPhase | null
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
          Choose a job and a resume, then generate. You can edit the result before exporting.
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
              {phaseMessage(phase)}
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
          {/* Only a transient error (network/rate-limit/timeout/API) gets a straight retry. A policy
              block re-fails on the same input, so instead the user edits their instructions on the
              left and hits Generate — no misleading "Try again" here. */}
          {errorRetryable && (
            <Button type="button" variant="outline" size="lg" className="mt-1 gap-2" onClick={onRetry}>
              <RotateCcw className="size-4" />
              Try again
            </Button>
          )}
        </div>
      ) : isGenerating && !letter ? (
        isGeneratingLetter(phase) ? (
          <StreamingSkeleton caption={phaseMessage(phase)} />
        ) : (
          <PreparingState caption={phaseMessage(phase)} />
        )
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
              "focus-visible:ring-0",
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

// Pre-generation state, shown while the input gates run (safety + intent classifiers) BEFORE the
// generator is called. Deliberately GENERIC — a plain spinner + neutral caption, NOT the letter-shaped
// shimmer — so we never imply a cover letter is being written before it actually is (the request may
// still be rejected by a guardrail).
function PreparingState({ caption }: { caption: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{caption}</p>
    </div>
  )
}

// Shown while the pipeline actually generates (draft → review → polish) before the vetted letter is
// revealed — a calm set of shimmer lines (not a bare spinner), grouped like a letter's salutation +
// body + sign-off, with a live phase caption so the wait reads as honest progress, not a blind spinner.
function StreamingSkeleton({ caption }: { caption: string }) {
  const lines = ["38%", "92%", "84%", "96%", "70%", null, "90%", "88%", "62%", null, "34%", "28%"]
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 px-5 pt-4 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin text-primary" />
        {caption}
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-5 py-4" aria-hidden>
        {lines.map((width, i) =>
          width === null ? (
            <div key={i} className="h-2" />
          ) : (
            <div key={i} className="h-3 animate-pulse rounded-full bg-muted" style={{ width }} />
          ),
        )}
      </div>
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
