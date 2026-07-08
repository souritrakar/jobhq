"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import {
  Check,
  ChevronsUpDown,
  CircleAlert,
  LoaderCircle,
  Paperclip,
  Sparkles,
  Star,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { draftAnswer } from "@/lib/application/client"
import { decodeMultiValue, encodeMultiValue } from "@/lib/application/answer-codec"
import { canAiDraft, FIELD_META, type StoredQuestion } from "./questions"

// Free-entry types map straight onto a native input `type`, so the browser gives us the
// right keyboard and validation affordances for free.
const NATIVE_TYPE: Partial<Record<StoredQuestion["type"], string>> = {
  short_text: "text",
  number: "number",
  url: "url",
  email: "email",
  tel: "tel",
  date: "date",
}

// Hard client-side backstop for a draft. The server bounds itself (~45s) and responds with a clean
// error, so this only fires when the SERVER never answers at all (restart mid-request, dropped
// connection) — without it the fetch can hang and leave the field stuck on "Drafting…" forever.
const DRAFT_CLIENT_TIMEOUT_MS = 60_000

export type ApplicationFieldProps = {
  question: StoredQuestion
  jobId: string
  /** Whether a resume is selected for this job — gates AI drafting (it's grounded in the resume). */
  hasResume: boolean
  /** Current value of this field (the parent owns the working draft; this field is controlled). */
  value: string
  /** Report a new value up to the parent (typing or an AI draft) — the parent tracks dirty + saves. */
  onChange: (next: string) => void
  /** Whether this field differs from the last saved value — shows a quiet "unsaved" marker. */
  dirty?: boolean
}

/**
 * One application question rendered as its real, fillable control.
 *
 * Every answerable question is CONTROLLED by the parent (`application-answers.tsx`): it renders the
 * passed `value` and reports edits via `onChange`; the parent tracks dirty state and batches a manual
 * save. Text-entry fields (textarea + single-line typed inputs) render the value directly, and the
 * textarea offers an AI draft (grounded in the job + the user's resume) that fills it via `onChange`.
 * Choice fields (select/radio/checkbox/multi_select) drive their selection from `value` too —
 * multi-value answers are JSON-encoded via `answer-codec`. Only `file` stays a preview (out of scope:
 * not persisted).
 *
 * A single consent checkbox (a `checkbox` with no options) is special-cased: its label IS the
 * statement, so it renders as one acknowledgement row instead of a label + separate control.
 */
export function ApplicationField({
  question,
  jobId,
  hasResume,
  value,
  onChange,
  dirty,
}: ApplicationFieldProps) {
  const isConsent = question.type === "checkbox" && !question.options?.length
  if (isConsent) return <ConsentField question={question} value={value} onChange={onChange} dirty={dirty} />

  const isTextEntry = question.type === "long_text" || question.type in NATIVE_TYPE
  if (isTextEntry) {
    return (
      <TextEntryField
        question={question}
        jobId={jobId}
        hasResume={hasResume}
        value={value}
        onChange={onChange}
        dirty={dirty}
      />
    )
  }

  // File: preview only — not persisted or autofilled (out of scope).
  if (question.type === "file") {
    return (
      <FieldShell question={question}>
        <FileField helpText={question.helpText} />
      </FieldShell>
    )
  }

  // Choice fields (select / radio / checkbox / multi_select): controlled + persisted.
  return (
    <FieldShell question={question}>
      <ChoiceControl question={question} value={value} onChange={onChange} />
      <FieldStatus drafting={false} error={null} dirty={dirty} />
    </FieldShell>
  )
}

/**
 * Shared layout for a question: the type chip, label (+ required/flagged markers), optional help
 * text, an optional action slot (the AI-draft button) and the control itself. Keeping this in one
 * place means the live text fields and the preview-only choice fields look identical.
 */
function FieldShell({
  question,
  action,
  labelFor,
  children,
}: {
  question: StoredQuestion
  action?: ReactNode
  labelFor?: string
  children: ReactNode
}) {
  const meta = FIELD_META[question.type]
  const Icon = meta.icon
  return (
    <div className="flex gap-3.5 sm:gap-4">
      {/* The type chip is the structural device: a column of these makes the form scannable by
          field kind (text vs choice vs upload) before reading a word. Squircle echoes LogoTile. */}
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-[30%]",
          question.flagged
            ? "bg-clay-soft text-clay-ink"
            : "bg-accent text-accent-foreground",
        )}
      >
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor={labelFor} className="text-sm font-medium leading-snug text-foreground">
              {question.label}
              {question.required && (
                <span className="ml-1 align-middle text-destructive" aria-label="required">
                  *
                </span>
              )}
            </label>
            {question.flagged && (
              <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-clay-ink">
                <Star className="size-3 fill-current" />
                Flagged
              </p>
            )}
          </div>
          {action}
        </div>

        {question.helpText && (
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{question.helpText}</p>
        )}

        <div className="mt-2.5">{children}</div>
      </div>
    </div>
  )
}

/**
 * A text answer (textarea or single-line typed input), controlled by the parent. It renders the
 * passed `value`, reports edits via `onChange`, and — for the textarea — offers an AI draft that
 * fills the field through the same `onChange`. It persists nothing itself; the parent
 * (`application-answers.tsx`) tracks dirty state and saves the whole form on demand.
 */
function TextEntryField({ question, jobId, hasResume, value, onChange, dirty }: ApplicationFieldProps) {
  const fieldId = useId()
  const draftable = canAiDraft(question)

  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  const draftAbortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  // On unmount: abort an in-flight draft so it never updates a gone component or lingers.
  useEffect(() => {
    return () => {
      mountedRef.current = false
      draftAbortRef.current?.abort()
    }
  }, [])

  async function handleDraft() {
    if (!hasResume || drafting) return
    draftAbortRef.current?.abort()
    const controller = new AbortController()
    draftAbortRef.current = controller
    // Backstop: abort if the server never responds, so the field can't stay on "Drafting…" forever.
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, DRAFT_CLIENT_TIMEOUT_MS)

    setDrafting(true)
    setDraftError(null)
    try {
      const { value: drafted } = await draftAnswer(jobId, question.id, controller.signal)
      if (!mountedRef.current) return
      onChange(drafted) // fills the field + marks it dirty; the user saves it with the rest
    } catch (err) {
      if (!mountedRef.current) return
      if (timedOut) {
        setDraftError("This is taking longer than expected. Please try again.")
      } else if (controller.signal.aborted) {
        return // superseded by a newer draft or unmount — that path owns the UI
      } else {
        setDraftError(err instanceof Error ? err.message : "Couldn't draft an answer. Try again.")
      }
    } finally {
      clearTimeout(timeout)
      // Only the LATEST request controls the spinner — an aborted older one must not clear it.
      if (mountedRef.current && draftAbortRef.current === controller) setDrafting(false)
    }
  }

  const isTextarea = question.type === "long_text"

  return (
    <FieldShell
      question={question}
      labelFor={fieldId}
      action={
        draftable ? (
          <AiDraftButton
            loading={drafting}
            disabled={!hasResume || drafting}
            reason={
              !hasResume
                ? "Select a resume first to draft an answer"
                : "Draft an answer from the job and your resume"
            }
            onClick={handleDraft}
          />
        ) : undefined
      }
    >
      {drafting ? (
        <DraftSkeleton textarea={isTextarea} />
      ) : isTextarea ? (
        <textarea
          id={fieldId}
          rows={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder ?? "Type your answer…"}
          className={cn(
            "min-h-[11rem] w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm shadow-xs transition-colors",
            "placeholder:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
          )}
        />
      ) : (
        <Input
          id={fieldId}
          type={NATIVE_TYPE[question.type] ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          className="bg-background"
        />
      )}

      <FieldStatus drafting={drafting} error={draftError} dirty={dirty} />
    </FieldShell>
  )
}

/** Skeleton shown in place of the control while the AI draft is being generated (not streamed). */
function DraftSkeleton({ textarea }: { textarea: boolean }) {
  return (
    <div
      role="status"
      aria-label="Drafting your answer"
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5",
        textarea ? "min-h-[6.5rem]" : "min-h-9 justify-center",
      )}
    >
      <span className="h-2.5 w-[92%] animate-pulse rounded-full bg-muted-foreground/20" />
      {textarea && (
        <>
          <span className="h-2.5 w-[80%] animate-pulse rounded-full bg-muted-foreground/20" />
          <span className="h-2.5 w-[88%] animate-pulse rounded-full bg-muted-foreground/20" />
          <span className="h-2.5 w-[60%] animate-pulse rounded-full bg-muted-foreground/20" />
        </>
      )}
    </div>
  )
}

/** The status line under a text field: a draft error, the drafting hint, or a quiet "unsaved" mark. */
function FieldStatus({
  drafting,
  error,
  dirty,
}: {
  drafting: boolean
  error: string | null
  dirty?: boolean
}) {
  if (error) {
    return (
      <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-destructive">
        <CircleAlert className="mt-px size-3.5 shrink-0" />
        <span>{error}</span>
      </p>
    )
  }
  if (drafting) {
    return <p className="mt-1.5 text-[11.5px] text-muted-foreground">Drafting your answer…</p>
  }
  if (dirty) {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <span aria-hidden className="size-1.5 rounded-full bg-clay" />
        Unsaved
      </p>
    )
  }
  return null
}

/** The choice controls (select/radio/checkbox/multi_select), controlled by the parent's answer state. */
function ChoiceControl({
  question,
  value,
  onChange,
}: {
  question: StoredQuestion
  value: string
  onChange: (next: string) => void
}) {
  const { type, placeholder, options } = question

  if (type === "select") {
    return (
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-9 w-full appearance-none rounded-md border border-border bg-background pl-3 pr-9 text-sm shadow-xs transition-colors",
            "text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
            value ? "" : "text-muted-foreground",
          )}
        >
          <option value="" disabled>
            {placeholder ?? "Select an option…"}
          </option>
          {options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    )
  }

  // radio = single selection (stored as a plain string); checkbox/multi_select = many (JSON array).
  const multiple = type !== "radio"
  return (
    <ChoiceGroup
      name={question.id}
      options={options ?? []}
      multiple={multiple}
      value={value}
      onChange={onChange}
    />
  )
}

/**
 * Radio (single) or checkbox/multi-select (many) choices as selectable rows, controlled by the
 * parent. Native inputs do the state + a11y; `has-[:checked]` styles the row and a custom indicator
 * so the control reads as part of the warm-paper system, not a default OS widget. Single answers store
 * the chosen option string; multi answers JSON-encode the selected options via `answer-codec`.
 */
function ChoiceGroup({
  name,
  options,
  multiple,
  value,
  onChange,
}: {
  name: string
  options: string[]
  multiple: boolean
  value: string
  onChange: (next: string) => void
}) {
  const selected = multiple ? decodeMultiValue(value) : value ? [value] : []

  function toggle(option: string) {
    if (!multiple) {
      onChange(option) // radio: replace the single selection
      return
    }
    const next = selected.includes(option)
      ? selected.filter((o) => o !== option)
      : [...selected, option]
    onChange(encodeMultiValue(next))
  }

  return (
    <div role={multiple ? "group" : "radiogroup"} className="flex flex-col gap-1.5">
      {options.map((option) => (
        <label
          key={option}
          className={cn(
            "group/opt flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors",
            "hover:border-input has-[:checked]:border-primary/60 has-[:checked]:bg-accent/50",
            "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/30",
          )}
        >
          <input
            type={multiple ? "checkbox" : "radio"}
            name={name}
            value={option}
            checked={selected.includes(option)}
            onChange={() => toggle(option)}
            className="sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "grid size-4 shrink-0 place-items-center border border-input text-primary-foreground transition-colors",
              "group-has-[:checked]/opt:border-primary group-has-[:checked]/opt:bg-primary",
              multiple ? "rounded-[5px]" : "rounded-full",
            )}
          >
            {multiple ? (
              <Check className="size-3 opacity-0 transition-opacity group-has-[:checked]/opt:opacity-100" />
            ) : (
              <span className="size-1.5 rounded-full bg-primary-foreground opacity-0 transition-opacity group-has-[:checked]/opt:opacity-100" />
            )}
          </span>
          <span className="leading-snug text-foreground">{option}</span>
        </label>
      ))}
    </div>
  )
}

/**
 * A single acknowledgement/consent question — its label is the statement to agree to. Controlled by
 * the parent: the answer is stored as "true" when checked, "" when not (a single boolean toggle, not
 * a multi-value answer), so it round-trips through the same `{questionId, value}` save path.
 */
function ConsentField({
  question,
  value,
  onChange,
  dirty,
}: {
  question: StoredQuestion
  value: string
  onChange: (next: string) => void
  dirty?: boolean
}) {
  const id = useId()
  return (
    <div>
      <label
        htmlFor={id}
        className={cn(
          "group/field flex cursor-pointer gap-3.5 rounded-lg border border-border bg-background p-3.5 transition-colors sm:gap-4",
          "hover:border-input has-[:checked]:border-primary/60 has-[:checked]:bg-accent/40",
          "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/30",
        )}
      >
        <input
          id={id}
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "")}
          className="sr-only"
        />
        <span
          aria-hidden
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border border-input text-primary-foreground transition-colors group-has-[:checked]/field:border-primary group-has-[:checked]/field:bg-primary"
        >
          <Check className="size-3.5 opacity-0 transition-opacity group-has-[:checked]/field:opacity-100" />
        </span>
        <span className="min-w-0 flex-1 text-sm leading-snug text-foreground">
          {question.label}
          {question.required && (
            <span className="ml-1 text-destructive" aria-label="required">
              *
            </span>
          )}
          {question.helpText && (
            <span className="mt-0.5 block text-[13px] text-muted-foreground">{question.helpText}</span>
          )}
        </span>
      </label>
      <FieldStatus drafting={false} error={null} dirty={dirty} />
    </div>
  )
}

/** Pick a file to preview it locally (filename only). Nothing is uploaded or persisted. */
function FileField({ helpText }: { helpText?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState<string | null>(null)

  if (name) {
    return (
      <div className="flex items-center gap-2.5 rounded-md border border-primary/50 bg-accent/40 px-3 py-2 text-sm">
        <Paperclip className="size-4 shrink-0 text-fern-700" />
        <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
        <button
          type="button"
          onClick={() => {
            setName(null)
            if (inputRef.current) inputRef.current.value = ""
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Remove file"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-3.5 text-[13px] text-muted-foreground transition-colors",
        "hover:border-primary/50 hover:bg-accent/30 hover:text-foreground",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
      )}
    >
      <Paperclip className="size-4" />
      <span>
        Drop a file or <span className="font-medium text-foreground">browse</span>
        {helpText ? <span className="text-muted-foreground"> · {helpText}</span> : null}
      </span>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
      />
    </button>
  )
}

/**
 * The AI affordance on the textarea — now live. Disabled (with a reason tooltip) until a resume is
 * selected, since the draft is grounded in the resume; shows a spinner while generating. The tooltip
 * keeps the gate legible without a loud banner (per the page's restrained AI framing).
 */
function AiDraftButton({
  loading,
  disabled,
  reason,
  onClick,
}: {
  loading: boolean
  disabled: boolean
  reason: string
  onClick: () => void
}) {
  return (
    <span className="group/ai relative shrink-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={reason}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11.5px] font-medium transition-colors",
          disabled
            ? "cursor-not-allowed text-muted-foreground opacity-80"
            : "text-muted-foreground hover:border-primary/40 hover:text-fern-700",
        )}
      >
        {loading ? (
          <LoaderCircle className="size-3 animate-spin" />
        ) : (
          <Sparkles className="size-3" />
        )}
        {loading ? "Drafting…" : "AI draft"}
      </button>
      {!loading && (
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-10 max-w-[16rem] whitespace-normal rounded-md bg-foreground px-2 py-1 text-right text-[11px] font-medium text-background opacity-0 transition-opacity duration-150 group-hover/ai:opacity-100"
        >
          {reason}
        </span>
      )}
    </span>
  )
}
