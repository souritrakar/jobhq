/**
 * Cover-letter prompt engineering — pure, no I/O.
 *
 * Builds the chat messages for ONE streaming model call that writes a tailored, human-sounding
 * cover letter from a saved job, an optional resume, and optional user instructions. The system
 * prompt encodes every rule from the PRD so the model can't drift into AI-template boilerplate:
 *   - standard structure: hook → why this company/role → evidence from the resume → close + CTA
 *   - match the posting's language/keywords WITHOUT stuffing
 *   - sound like a real person: vary sentence length, no clichés, no purple prose
 *   - NEVER fabricate experience, metrics, or claims the resume doesn't support
 *   - respect the user's instructions, and output clean prose only (no [placeholders])
 *
 * The model + temperature live here too so the route and any future caller agree on them.
 */

import type { ChatMessage } from "@/lib/llm/extraction"

/** Higher than extraction's temp 0 — a letter needs natural variation, not a deterministic form. */
export const COVER_LETTER_TEMPERATURE = 0.7

/**
 * Output cap. A strong one-page letter is ~250–350 words (~450–550 tokens); 700 leaves headroom
 * for a slightly longer letter + sign-off while keeping a hard ceiling on cost and runaway output.
 */
export const COVER_LETTER_MAX_TOKENS = 700

/** The job facts the letter draws on. A thin slice of the saved Job — only what informs the letter. */
export type CoverLetterJob = {
  title: string
  company: string
  location?: string | null
  description?: string | null
  employmentType?: string | null
  workplaceType?: string | null
}

export type CoverLetterInputs = {
  job: CoverLetterJob
  /** Full resume text, when the user picked one. Absent → a less-personalized letter. */
  resumeText?: string | null
  /** Free-text tone/emphasis/length notes from the user. */
  instructions?: string | null
}

const SYSTEM_PROMPT = [
  "You are an expert cover-letter writer. You write tailored, specific, genuinely human cover letters",
  "that read like a thoughtful candidate wrote them — not like AI filled in a template.",
  "",
  "STRUCTURE (follow it, but never label the sections):",
  "1. Open with a real hook — a specific reason for interest or a sharp, relevant line. Never open with",
  '   "I am writing to express my interest in" or "I am excited to apply".',
  "2. Why this company and this role specifically — show you understand what they do and what the role needs.",
  "3. Evidence: 2–3 concrete, relevant points from the candidate's background that map to the role's needs.",
  "4. Close with a confident, low-pressure call to action.",
  "",
  "VOICE:",
  "- Sound like a real person. Vary sentence length and rhythm; mix short punchy sentences with longer ones.",
  "- Plain, direct, warm-but-professional. No clichés (synergy, fast-paced environment, team player,",
  "  hit the ground running, passionate about, proven track record), no purple prose, no hype.",
  "- Mirror the posting's actual language and keywords where they fit naturally — never keyword-stuff.",
  "- Be concrete over generic: name the specific skill, project, or outcome, not 'various technologies'.",
  "",
  "HARD RULES:",
  "- NEVER invent experience, employers, titles, metrics, or claims. Use ONLY what the resume and job",
  "  provide. If no resume is given, write a sincere, role-focused letter from the posting alone WITHOUT",
  "  inventing a background — speak to interest, understanding of the role, and transferable intent.",
  "- Do NOT fabricate the candidate's name, contact details, dates, or a recipient name. If a detail isn't",
  "  provided, write around it — never emit bracketed placeholders like [Your Name], [Company], or [Date].",
  "- Obey the user's instructions (tone, emphasis, length) when present; they override style defaults",
  "  but never the no-fabrication rule.",
  "",
  "FORMAT (standard business-letter conventions):",
  "- Open with a salutation on its own line, e.g. 'Dear Hiring Team,' (or 'Dear <Company> Team,' when",
  "  you can ground it). Never invent a specific recipient's name.",
  "- 3–4 short paragraphs. Separate EVERY paragraph with a single blank line. Keep paragraphs tight",
  "  (2–4 sentences) — no walls of text.",
  "- Length: about 250–350 words (≈ one page) unless the user asks otherwise. Sharper beats longer.",
  "- End with a brief closing line, then a sign-off on its own line ('Sincerely,' or 'Best regards,').",
  "  Do NOT add a fabricated name, address, date, phone/email, or letterhead after the sign-off.",
  "",
  "OUTPUT:",
  "- Return ONLY the letter as clean plain-text prose, ready to send: salutation, body paragraphs,",
  "  sign-off. No preamble, no notes, no markdown, no surrounding quotes, no subject line, no",
  "  bracketed placeholders like [Your Name] or [Company].",
].join("\n")

function jobBlock(job: CoverLetterJob): string {
  const lines = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    job.workplaceType ? `Workplace: ${job.workplaceType}` : null,
    job.employmentType ? `Employment type: ${job.employmentType}` : null,
    "",
    "Job description:",
    (job.description?.trim() || "(no description was captured for this posting)"),
  ].filter((l) => l !== null)
  return lines.join("\n")
}

/** Build the system + user messages for the OpenAI-compatible streaming chat call (OpenRouter). */
export function buildCoverLetterMessages(inputs: CoverLetterInputs): ChatMessage[] {
  const { job, resumeText, instructions } = inputs

  const resumeSection = resumeText?.trim()
    ? `The candidate's resume (the ONLY source for their background — do not go beyond it):\n"""\n${resumeText.trim()}\n"""`
    : "No resume was provided. Write a sincere, role-focused letter from the posting alone. Do NOT invent a work history, employers, skills, or metrics — focus on genuine interest and understanding of the role."

  const instructionSection = instructions?.trim()
    ? `\n\nUser instructions (follow these — they take priority over style defaults, but never override the no-fabrication rules):\n"""\n${instructions.trim()}\n"""`
    : ""

  const user = [
    "Write a cover letter for this job.",
    "",
    "JOB POSTING:",
    jobBlock(job),
    "",
    resumeSection,
    instructionSection,
    "",
    "Now write the letter following every rule above. Output the letter body only.",
  ].join("\n")

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ]
}
