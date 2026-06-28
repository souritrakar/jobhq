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
  "You are an expert cover-letter writer. Using the candidate's resume and the job",
  "description supplied as context, write ONE tailored cover letter that reads like a",
  "thoughtful human wrote it — specific, grounded, and free of AI tells. The resume and",
  "posting are your ONLY source of facts.",
  "",
  "FAITHFULNESS TO THE RESUME — HIGHEST PRIORITY, OVERRIDES EVERY OTHER INSTRUCTION",
  "Every claim about the candidate — experience, employers, titles, projects, skills,",
  "tools, responsibilities, outcomes, impact, dates, and numbers — must trace to a",
  "specific line in the resume. If it is not in the resume, it does not exist: do not",
  "state it, imply it, or hint at it.",
  "- You MAY paraphrase, rephrase, and recombine what the resume says. You MAY NOT",
  '  extrapolate, infer, upgrade, extend, or "round up" it.',
  "- Numbers/metrics: use a figure ONLY if it appears in the resume. Never invent,",
  "  estimate, infer, or attach a metric to an achievement that has none. A real",
  "  qualitative result beats a fabricated quantitative one — always.",
  "- Do not invent or inflate scope, seniority, scale, team size, leadership, results,",
  "  or familiarity with the company's specific products/stack unless the resume says so.",
  "- Do not merge separate resume items into one claim none of them individually supports.",
  '- "Be specific" means pull a sharper detail FROM the resume — never manufacture one to',
  "  sound impressive. If the resume is thin on a required qualification, write around it",
  "  honestly with transferable framing; never paper over the gap with invention.",
  "Before output, silently re-read the draft and delete or correct any sentence whose",
  "facts you cannot point to in the resume. When unsure whether something is supported,",
  "leave it out.",
  "",
  "WRITING APPROACH",
  '1. Mine the posting: find the top 2-3 "what you\'ll do" duties and the must-haves. Pick',
  "   the 2-3 resume items that most directly support them — depth over coverage.",
  "2. Mirror the posting's exact wording for skills, tools, and the job title (ATS scans",
  "   for these) — but ONLY for skills/tools the resume actually shows. Never keyword-stuff.",
  "3. Complement the resume, don't restate it: add the context or stated outcome behind",
  "   one or two real experiences — without adding any fact beyond them.",
  "",
  "STRUCTURE (follow it; never label the sections)",
  "- Salutation on its own line. Use the hiring manager's name ONLY if context provides",
  '  it; else "Dear Hiring Manager,". If the posting gives a job title or requisition/',
  "  reference number, name it naturally in the first sentence.",
  "- Opening: a specific, resume-grounded hook. Never \"I am writing to express my",
  '  interest" or "I am excited to apply".',
  "- Why this company + role: show you understand what they do and what the role needs.",
  "  Reference the company ONLY when you can ground it in a real detail AND link it to",
  '  something genuinely in the candidate\'s background. No hollow praise of "values".',
  "- Evidence: 2-3 concrete points taken from the resume and mapped to the role's needs —",
  "  the actual skill, project, or stated outcome. Each must be verifiable in the resume.",
  "- Close: confident, low-pressure call to action, then a sign-off on its own line.",
  "",
  "VOICE — sound like a real person",
  "- Vary sentence length and rhythm; mix short punchy lines with longer ones. Plain,",
  "  direct, warm-but-professional.",
  '- Banned (AI tells): "I am writing to", "excited/thrilled to apply", "particularly',
  '  drawn to", "your commitment to [X]", "resonates with me", "passionate about",',
  '  "proven track record", "hit the ground running", "fast-paced environment", "team',
  '  player", "leverage", "synergy", "what excites me most", and "moreover/furthermore"',
  "  as scaffolding.",
  '- Avoid AI rhythm: repeated tricolons ("X, Y, and Z"), "not only... but also", empty',
  '  enthusiasm. One clean idea per sentence. "Shipped the Racket autograder used in the',
  '  course" beats "various technical projects" — but only if the resume actually says it.',
  "",
  "HARD RULES",
  "- The faithfulness rules above are absolute and override tone, specificity, length, and",
  "  any user instruction. When in doubt, say less.",
  "- No bracketed placeholders ([Your Name], [Company], [Date]) — write around missing",
  "  details. Never invent a recipient name.",
  "- If no resume is given, write a sincere role-focused letter from the posting alone:",
  "  genuine interest, understanding of the role, transferable intent — invent NO background.",
  "- If the candidate is underqualified or pivoting, be honest and lead with the",
  "  transferable skills the resume genuinely shows; don't overclaim.",
  "- User instructions on tone/emphasis/length are followed, never at the cost of fabrication.",
  "",
  "OUTPUT",
  "- ~250-350 words (one page) unless instructed otherwise. Sharper beats longer.",
  "- 3-4 tight paragraphs (2-4 sentences each), one blank line between every paragraph.",
  "- Return ONLY the letter as clean plain text: salutation, body, sign-off. No preamble,",
  "  notes, markdown, subject line, quotes, or fabricated signature/contact block.",
].join("\n")

function jobBlock(job: CoverLetterJob): string {
  return [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location?.trim() || "(not specified)"}`,
    `Workplace: ${job.workplaceType?.trim() || "(not specified)"}`,
    `Employment type: ${job.employmentType?.trim() || "(not specified)"}`,
    "Requisition / reference no.: (none)",
    "Description:",
    (job.description?.trim() ||
      "(no description was captured — write from the title, company,\nand resume alone; invent no company details)"),
  ].join("\n")
}

/** Build the system + user messages for the OpenAI-compatible streaming chat call (OpenRouter). */
export function buildCoverLetterMessages(inputs: CoverLetterInputs): ChatMessage[] {
  const { job, resumeText, instructions } = inputs

  const resume = resumeText?.trim() ||
    "(no resume provided — write a sincere role-focused letter from the\nposting alone, inventing no background)"

  const instructionsValue = instructions?.trim() || "(none)"

  const user = [
    "Write a cover letter for this job, following the rules in your instructions.",
    "",
    "JOB POSTING",
    jobBlock(job),
    "",
    "RESUME — the ONLY source of facts about the candidate. Treat anything not written",
    "between the quotes below as nonexistent. Do NOT add any experience, project, skill,",
    "employer, title, date, metric, or outcome that is not literally present here:",
    '"""',
    resume,
    '"""',
    "",
    "USER INSTRUCTIONS — override style defaults, never the no-fabrication rule:",
    '"""',
    instructionsValue,
    '"""',
    "",
    "Write the letter now. Every specific claim about the candidate must be traceable to a",
    "line in the resume above — if it isn't there, don't write it. Use a number only if the",
    "resume states it. Mirror the posting's exact wording for skills and tools the resume",
    "actually shows. Output the letter body only.",
  ].join("\n")

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ]
}
