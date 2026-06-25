/**
 * Answer-draft prompt engineering — pure, no I/O.
 *
 * Builds the messages for ONE non-streaming model call that drafts a single application answer from
 * the job posting, the question, and the user's resume. The message split is deliberate and serves
 * prompt caching: the static instructions and the per-application job+resume block are marked as
 * cache breakpoints, while the specific question is the only varying tail. So drafting a second
 * question for the SAME application reuses the cached instructions+job+resume prefix and only
 * re-bills the question — the cost win for a form with many questions.
 *
 * The system prompt encodes the quality bar: sound like a real person (not AI boilerplate), use the
 * role's actual vocabulary and tone, NEVER fabricate, no em dashes, and output only the answer.
 */

import type { LlmMessage } from "@/lib/llm/openrouter"

/** Grounded but natural — low enough to stay anchored to the resume, high enough to not read like a form. */
export const ANSWER_DRAFT_TEMPERATURE = 0.6

/** Primary model first, then configured fallbacks, in order, deduped. */
export function answerDraftModelChain(model: string, fallbacks: string): string[] {
  const extra = fallbacks
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return [model, ...extra].filter((m, i, a) => a.indexOf(m) === i)
}

/** The job facts the answer draws on — a thin slice of the saved Job. */
export type AnswerDraftJob = {
  title: string
  company: string
  location?: string | null
  description?: string | null
  employmentType?: string | null
  workplaceType?: string | null
}

/** The one question being answered. `helpText`/`placeholder` hint at the expected content/length. */
export type AnswerDraftQuestion = {
  label: string
  helpText?: string
  placeholder?: string
}

export type AnswerDraftInputs = {
  job: AnswerDraftJob
  question: AnswerDraftQuestion
  /** Full resume text — the ONLY source for the candidate's background. */
  resumeText: string
}

const SYSTEM_PROMPT = [
  "You draft answers to job application questions on behalf of a candidate. You write in the",
  "candidate's first-person voice, grounded entirely in their resume and the job posting, so the",
  "answer reads like the candidate wrote it themselves — thoughtful and specific, never like AI",
  "filled in a template.",
  "",
  "VOICE:",
  "- Sound like a real person writing about their own experience. Vary sentence length and rhythm;",
  "  mix short, direct sentences with longer ones. Plain, confident, warm-but-professional.",
  "- Use the vocabulary, tone, and conventions of the role's field and seniority. A backend role,",
  "  a design role, a sales role, and a research role each have their own register — match it, using",
  "  the posting's own terminology where it fits naturally. Never keyword-stuff.",
  "- No clichés or filler (passionate about, team player, fast-paced environment, hit the ground",
  "  running, proven track record, synergy), no hype, no purple prose, no AI throat-clearing.",
  "- Be concrete over generic: name the specific skill, project, tool, or outcome from the resume,",
  "  not 'various technologies' or 'a range of projects'.",
  "",
  "HARD RULES:",
  "- Use ONLY what the resume and job posting provide. NEVER invent employers, titles, dates,",
  "  metrics, credentials, or experiences the resume doesn't support. If the resume lacks something",
  "  the question asks for, answer honestly from genuine interest, transferable skills, and",
  "  understanding of the role — do not fabricate a background.",
  "- Answer the SPECIFIC question that is asked. Respect any length or format hint the question",
  "  gives (help text / placeholder). When none is given, write a focused, complete answer: usually",
  "  one to three tight paragraphs. Sharper beats longer — do not pad.",
  "- Do NOT use em dashes (the — character) anywhere. Use periods, commas, or 'and' instead.",
  "- Do not address it as a letter (no salutation, no sign-off) — it is a direct answer to a form",
  "  field. Do not restate the question.",
  "",
  "OUTPUT:",
  "- Return ONLY the answer text, ready to paste into the field. No preamble ('Sure,', 'Here is'),",
  "  no markdown, no surrounding quotes, no bracketed placeholders like [Your Name] or [Company],",
  "  no notes about what you did.",
].join("\n")

function jobBlock(job: AnswerDraftJob): string {
  return [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    job.workplaceType ? `Workplace: ${job.workplaceType}` : null,
    job.employmentType ? `Employment type: ${job.employmentType}` : null,
    "",
    "Job description:",
    job.description?.trim() || "(no description was captured for this posting)",
  ]
    .filter((l) => l !== null)
    .join("\n")
}

function questionBlock(q: AnswerDraftQuestion): string {
  return [
    `Question: ${q.label}`,
    q.helpText ? `Guidance shown with the question: ${q.helpText}` : null,
    q.placeholder ? `Field placeholder: ${q.placeholder}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n")
}

/**
 * Build the messages for the OpenRouter call. Ordering matters for caching: the static instructions
 * come first (cacheable across everyone), then the job+resume context as its own cached message
 * (stable across every question in this application), then the question itself as the only
 * uncached, varying tail.
 */
export function buildAnswerDraftMessages(inputs: AnswerDraftInputs): LlmMessage[] {
  const { job, question, resumeText } = inputs

  const context = [
    "JOB POSTING:",
    jobBlock(job),
    "",
    "CANDIDATE'S RESUME (the ONLY source for their background — do not go beyond it):",
    '"""',
    resumeText.trim(),
    '"""',
  ].join("\n")

  const task = [
    "Draft the candidate's answer to this application question, following every rule above.",
    "",
    questionBlock(question),
    "",
    "Output only the answer text.",
  ].join("\n")

  return [
    { role: "system", content: SYSTEM_PROMPT, cache: true },
    // Stable across all questions in this application → cached so only the question below re-bills.
    { role: "user", content: context, cache: true },
    { role: "user", content: task },
  ]
}

/**
 * Strip anything the model might prepend/wrap despite the prompt, and enforce the no-em-dash rule
 * deterministically (a model can still slip one in). Cheap belt-and-suspenders over the prompt.
 */
export function cleanDraftedAnswer(raw: string): string {
  let text = raw.trim()
  // Drop a single layer of wrapping quotes if the whole answer is quoted.
  if (text.length > 1 && /^["'][\s\S]*["']$/.test(text)) {
    text = text.slice(1, -1).trim()
  }
  // Enforce the no-em-dash rule deterministically: an em dash between words becomes a comma; one
  // hugging a word (rare) becomes a plain space. En dashes are left alone (date/number ranges).
  text = text.replace(/\s+—\s+/g, ", ").replace(/—/g, " ")
  return text
}
