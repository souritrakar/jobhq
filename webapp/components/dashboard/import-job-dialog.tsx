"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { Job, JobApplication } from "@prisma/client"
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Info,
  Link2,
  ListChecks,
  LoaderCircle,
  MapPin,
  Plus,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { ApplicationQuestion } from "@/lib/llm/application-extraction"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { LogoTile, displayCompany } from "@/components/dashboard/logo-tile"

type ImportedJob = Job & { application: JobApplication | null }

// Mirrors the server's ImportResult (lib/server/job-import.ts). Job details and the application
// form can live on different URLs, so a scrape yields one or the other when not both.
type ImportResult =
  | { outcome: "saved"; job: ImportedJob }
  | { outcome: "application_only"; questions: ApplicationQuestion[] }

// idle → loading → (saved | needs_job | error). `saved` may still be missing its form (offer to
// add it); `needs_job` has the form but no posting (offer to add the posting link).
type View = "idle" | "loading" | "saved" | "needs_job" | "error"

// Shown one after another while the (10–60s) scrape runs, so the wait never feels stalled.
const LOADING_STEPS = [
  "Fetching the posting…",
  "Reading the job details…",
  "Looking for application questions…",
  "Saving to your dashboard…",
]

const inputClass = cn(
  "h-10 w-full min-w-0 rounded-md border border-border bg-background pl-9 pr-3 text-sm shadow-xs transition-colors",
  "placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60",
)

// Prepend https:// when the user pastes a bare host, so "acme.com/jobs/1" still validates.
function withScheme(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(withScheme(raw))
    return Boolean(u.hostname) && u.hostname.includes(".")
  } catch {
    return false
  }
}

function questionLabel(n: number): string {
  return `${n} application ${n === 1 ? "question" : "questions"}`
}

/**
 * "Save a job from a link" modal. Pastes a URL → POST /api/jobs/import (one Firecrawl scrape
 * server-side). Because a job's details and its application form sometimes live on separate URLs,
 * the result can be partial: a saved job with no form (offer to add the apply-page URL), or a form
 * with no job (offer to add the posting URL). Self-contained: pass the trigger element; the dialog
 * owns its open + request state and refreshes the list behind it on every save.
 */
export function ImportJobDialog({ trigger }: { trigger: React.ReactElement }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [view, setView] = useState<View>("idle")
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<ImportedJob | null>(null)
  const [pending, setPending] = useState<ApplicationQuestion[] | null>(null)
  // Set after a separate apply page is attached, so we can confirm "added N questions".
  const [justAdded, setJustAdded] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Advance the reassurance copy while loading; pin on the last step until the call returns.
  useEffect(() => {
    if (view !== "loading") return
    const id = setInterval(() => {
      setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1))
    }, 2500)
    return () => clearInterval(id)
  }, [view])

  // Keep focus on the field when (re)entering the idle form.
  useEffect(() => {
    if (open && view === "idle") inputRef.current?.focus()
  }, [open, view])

  function handleOpenChange(next: boolean) {
    // Closing mid-import abandons the in-flight scrape rather than leaving it running.
    if (!next) abortRef.current?.abort()
    setOpen(next)
  }

  // Reset to a clean idle form once the close animation finishes (no flicker mid-close).
  function handleOpenChangeComplete(isOpen: boolean) {
    if (isOpen) return
    reset()
  }

  function reset() {
    setUrl("")
    setView("idle")
    setStep(0)
    setError(null)
    setJob(null)
    setPending(null)
    setJustAdded(null)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!isValidUrl(url) || view === "loading") return

    const controller = new AbortController()
    abortRef.current = controller
    setView("loading")
    setStep(0)
    setError(null)

    try {
      const res = await fetch("/api/jobs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: withScheme(url) }),
        signal: controller.signal,
      })
      const body = await res.json().catch(() => null)

      if (!res.ok || !body?.data) {
        setError(
          body?.error?.message ??
            "Something went wrong while importing. Please try again.",
        )
        setView("error")
        return
      }

      const result = body.data as ImportResult
      if (result.outcome === "application_only") {
        // An apply page with no job identity (e.g. an Ashby `…/application` route). Hold the
        // questions; ask for the job posting URL and carry them over when it saves.
        setPending(result.questions)
        setView("needs_job")
        return
      }

      setJob(result.job)
      setView("saved")
      router.refresh() // the saved-jobs list behind the modal picks up the new row
    } catch {
      if (controller.signal.aborted) return // user cancelled — no error to show
      setError("We couldn't reach the server. Check your connection and try again.")
      setView("error")
    }
  }

  // Attach a separate apply page's form to the job we just saved (the "saved, no form" case).
  async function attachApplication(secondUrl: string, signal: AbortSignal) {
    if (!job) return
    const res = await fetch(`/api/jobs/${job.id}/application`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: secondUrl }),
      signal,
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.data) {
      throw new Error(
        body?.error?.message ??
          "We couldn't add the application questions. Please try again.",
      )
    }
    const updated = body.data as ImportedJob
    setJob(updated)
    setJustAdded(updated.application?.questionCount ?? 0)
    router.refresh()
  }

  // Save the job from the posting URL, carrying the questions we already found (the "form first,
  // then the posting" case). Throws a friendly message when the second link still isn't a posting.
  async function importWithCarry(secondUrl: string, signal: AbortSignal) {
    const res = await fetch("/api/jobs/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: secondUrl, carryQuestions: pending ?? [] }),
      signal,
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.data) {
      throw new Error(
        body?.error?.message ??
          "We couldn't read that job posting. Please try again.",
      )
    }
    const result = body.data as ImportResult
    if (result.outcome === "saved") {
      setJob(result.job)
      setPending(null)
      setView("saved")
      router.refresh()
      return
    }
    // Still no job details — the user pasted another apply link, not the posting itself.
    throw new Error(
      "That link didn't have the job details either. Paste the main job posting page (the role overview), not another apply link.",
    )
  }

  const canSubmit = isValidUrl(url) && view !== "loading"
  const savedQuestionCount = job?.application?.questionCount ?? 0

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={handleOpenChangeComplete}
    >
      <DialogTrigger render={trigger} />

      <DialogContent showClose={view !== "loading"}>
        {view === "idle" && (
          <form onSubmit={handleSubmit}>
            <DialogTitle>Save a job from a link</DialogTitle>
            <DialogDescription>
              Paste a job posting URL and we&apos;ll pull in the role, company, and any
              application questions. No extension needed.
            </DialogDescription>

            <div className="relative mt-4">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://…  paste a job posting link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <DialogClose
                render={
                  <Button type="button" variant="ghost" size="lg">
                    Cancel
                  </Button>
                }
              />
              <Button type="submit" size="lg" disabled={!canSubmit}>
                <Plus className="size-4" strokeWidth={2.5} />
                Save job
              </Button>
            </div>
          </form>
        )}

        {view === "loading" && (
          <div className="flex flex-col items-center px-2 py-4 text-center">
            <DialogTitle className="sr-only">Importing job</DialogTitle>
            <span className="grid size-12 place-items-center rounded-full bg-primary/10">
              <LoaderCircle className="size-6 animate-spin text-primary" />
            </span>
            <p aria-live="polite" className="mt-4 text-sm font-medium text-foreground">
              {LOADING_STEPS[step]}
            </p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Reading{" "}
              <span className="font-medium text-foreground/70">{hostLabel(url)}</span>.
              This can take up to a minute for some sites.
            </p>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="mt-5 cursor-pointer text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Cancel
            </button>
          </div>
        )}

        {view === "saved" && job && (
          <div>
            <DialogTitle className="flex items-center gap-2">
              <CircleCheck className="size-5 text-primary" />
              Job saved
            </DialogTitle>
            <DialogDescription>
              {justAdded !== null
                ? `Added ${questionLabel(justAdded)} to this job.`
                : "Added to your dashboard."}
            </DialogDescription>

            <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-background p-3">
              <PreviewLogo logoUrl={job.logoUrl} company={job.company} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold leading-snug">
                  {job.title}
                </p>
                <p className="mt-0.5 truncate text-[13px] font-medium text-muted-foreground">
                  {displayCompany(job.company) ?? "Company unknown"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {job.location && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      <MapPin className="size-3" />
                      <span className="max-w-[12rem] truncate">{job.location}</span>
                    </span>
                  )}
                  {job.salary && (
                    <span className="inline-flex items-center rounded-full bg-fern-700/10 px-2 py-0.5 text-[11px] font-medium text-fern-700">
                      {job.salary}
                    </span>
                  )}
                  {savedQuestionCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <ListChecks className="size-3" />
                      {questionLabel(savedQuestionCount)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* The form often lives on a separate Apply page. If we saved the job but found no
                questions, let the user point us at that page so we can attach them. */}
            {savedQuestionCount === 0 && (
              <SecondaryImport
                tone="info"
                heading="No application questions found"
                description="They're often on a separate Apply page. Paste that link and we'll add them to this job."
                placeholder="https://…  the application / apply page"
                submitLabel="Add questions"
                busyLabel="Reading the apply page…"
                run={attachApplication}
              />
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="lg" onClick={reset}>
                Save another
              </Button>
              <Button
                size="lg"
                render={
                  <Link href={`/dashboard/jobs/${job.id}`} onClick={() => setOpen(false)} />
                }
              >
                View job
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {view === "needs_job" && pending && (
          <div>
            <DialogTitle className="flex items-center gap-2">
              <Info className="size-5 text-primary" />
              Add the job posting
            </DialogTitle>
            <DialogDescription>
              That link looks like an application page. We found the questions but not the role
              itself. Paste the main job posting URL to finish saving.
            </DialogDescription>

            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <ListChecks className="size-3.5" />
              {questionLabel(pending.length)} ready to attach
            </div>

            <SecondaryImport
              tone="plain"
              placeholder="https://…  the job posting link"
              submitLabel="Save job"
              busyLabel="Reading the posting…"
              run={importWithCarry}
            />

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                onClick={reset}
                className="cursor-pointer text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Start over
              </button>
            </div>
          </div>
        )}

        {view === "error" && (
          <div>
            <DialogTitle className="flex items-center gap-2">
              <CircleAlert className="size-5 text-destructive" />
              Couldn&apos;t save that job
            </DialogTitle>
            <DialogDescription>{error}</DialogDescription>

            <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Tip: make sure the link opens a single job posting. You can also save jobs
              from any site with our Chrome extension.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <DialogClose
                render={
                  <Button type="button" variant="ghost" size="lg">
                    Close
                  </Button>
                }
              />
              <Button type="button" size="lg" onClick={() => setView("idle")}>
                Try again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The inline "paste a second URL" form used by both partial-result views: it adds the missing
 * application form to a saved job, or the missing job posting to a found form. It owns its own
 * input, validation, busy/abort, and error; `run` (provided by the parent) performs the fetch and
 * the view transition on success — so a thrown Error here is shown inline as a retryable message.
 */
function SecondaryImport({
  heading,
  description,
  placeholder,
  submitLabel,
  busyLabel,
  tone,
  run,
}: {
  heading?: string
  description?: string
  placeholder: string
  submitLabel: string
  busyLabel: string
  tone: "info" | "plain"
  run: (url: string, signal: AbortSignal) => Promise<void>
}) {
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Abort an in-flight scrape if the view changes / dialog closes under us.
  useEffect(() => () => abortRef.current?.abort(), [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!isValidUrl(url) || busy) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    try {
      // On success `run` transitions the parent view and this form unmounts — no need to reset busy.
      await run(withScheme(url), controller.signal)
    } catch (err) {
      if (controller.signal.aborted) {
        setBusy(false)
        return
      }
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setBusy(false)
    }
  }

  const canSubmit = isValidUrl(url) && !busy

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "mt-4",
        tone === "info" && "rounded-lg border border-border bg-muted/40 p-3",
      )}
    >
      {heading && <p className="text-[13px] font-semibold text-foreground">{heading}</p>}
      {description && (
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}

      <div className={cn("relative", (heading || description) && "mt-2.5")}>
        <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={url}
          disabled={busy}
          onChange={(e) => {
            setUrl(e.target.value)
            if (error) setError(null)
          }}
          className={inputClass}
        />
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="min-h-4 text-[11px] text-muted-foreground" aria-live="polite">
          {busy ? `${busyLabel} this can take up to a minute.` : ""}
        </span>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {busy ? (
            <>
              <LoaderCircle className="size-3.5 animate-spin" />
              Working…
            </>
          ) : (
            <>
              <Plus className="size-3.5" strokeWidth={2.5} />
              {submitLabel}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

// The captured company logo (Firecrawl branding) when we have a usable one, falling back to
// the app's standard tinted-initial tile — including when the image URL 404s at render time.
function PreviewLogo({
  logoUrl,
  company,
}: {
  logoUrl: string | null
  company: string
}) {
  const [broken, setBroken] = useState(false)
  if (logoUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary external logo host; avoids next/image domain config
      <img
        src={logoUrl}
        alt=""
        onError={() => setBroken(true)}
        className="size-10 shrink-0 rounded-[30%] border border-border bg-white object-contain p-1"
      />
    )
  }
  return <LogoTile company={displayCompany(company)} className="size-10" />
}

// A short, human host label for the loading copy, e.g. "linkedin.com".
function hostLabel(raw: string): string {
  try {
    return new URL(withScheme(raw)).hostname.replace(/^www\./, "")
  } catch {
    return "the posting"
  }
}
