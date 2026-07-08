import { ApiError } from "@/lib/api/errors"
import type { CoverLetterJob } from "@/lib/llm/cover-letter"
import { classifyIntent } from "@/lib/llm/cover-letter-intent"
import { moderateText } from "@/lib/llm/moderation"
import { getJob } from "@/lib/server/jobs"
import { getResumeText } from "@/lib/server/resumes"
import type { GenerateCoverLetterInput } from "@/lib/validations/cover-letter"

/**
 * Cover-letter PRE-GENERATION gates (Stage 5 steps 1–3) — the cheap checks that run BEFORE any
 * expensive model call and therefore BEFORE the response stream opens, so each still surfaces as the
 * standard JSON `{ error }` envelope rather than a mid-stream event.
 *
 * Owns the DB access (loading the job, user-scoped), resume resolution, and the two INPUT GATES that
 * decide whether the request is even allowed to reach the expensive generator:
 *   - content moderation (harmful/hateful/abusive → block), and
 *   - the INTENT gate (off-task / prompt-injection / prompt-extraction → block).
 * Both run in parallel with the DB reads (≈0 added latency) and both fail open. Only a request that is
 * valid + safe + on-task proceeds; everything else dies here, spending ZERO generation calls. The
 * generation/eval/revise orchestration lives in lib/server/cover-letter-pipeline.ts (after the stream
 * opens).
 *
 * Resume content comes from the user's uploaded documents (lib/server/resumes.ts), parsed to text.
 * A resume is mandatory (see the validation schema), so a resumeId that resolves to no readable
 * text — a foreign id, or an unreadable file (scanned/image-only PDF, legacy .doc) — is a clean
 * BAD_REQUEST here, BEFORE any bytes stream, rather than silently generating an ungrounded letter.
 */

export type PreparedCoverLetter = {
  job: CoverLetterJob
  /** Resolved, non-empty resume text (a resume is mandatory; an unreadable one throws above). */
  resumeText: string
  instructions?: string | null
}

export async function prepareCoverLetter(
  userId: string,
  input: GenerateCoverLetterInput,
): Promise<PreparedCoverLetter> {
  // Fetch job + resume and run BOTH input gates together — each only needs the instructions, so they
  // overlap the DB reads instead of adding serial round-trips. getJob enforces ownership (404
  // otherwise); getResumeText is user-scoped (a foreign id → null, never leaking another user's file).
  // moderateText + classifyIntent both fail open, so an unavailable classifier degrades to "allow"
  // rather than blocking every letter.
  const instructions = input.instructions?.trim() ? input.instructions : null
  const [job, resumeText, moderation, intent] = await Promise.all([
    getJob(userId, input.jobId),
    getResumeText(userId, input.resumeId),
    instructions ? moderateText(instructions) : Promise.resolve(null),
    instructions ? classifyIntent(instructions) : Promise.resolve(null),
  ])

  // Input gate 1 — content safety: a harmful/hateful/abusive instruction never spends a generation.
  // Kept vague on purpose (no category echo) so we don't coach around the filter.
  if (moderation?.flagged) {
    throw new ApiError(
      "BAD_REQUEST",
      "Those instructions were flagged by our safety filter, so we didn't generate a letter. Please rephrase and try again.",
    )
  }

  // Input gate 2 — intent: an off-task, prompt-injection, or prompt-extraction instruction never
  // spends a generation either. The message is helpful (says what the tool does) without revealing the
  // guardrail or coaching around it.
  if (intent && !intent.onTask) {
    throw new ApiError(
      "BAD_REQUEST",
      "This tool only writes cover letters. Tell us how to tailor your letter — tone, length, or what to emphasize — and try again.",
    )
  }

  // A resume is mandatory. A null/empty resolution means a foreign id or a file with no extractable
  // text (scanned/image-only PDF, legacy .doc) — we can't ground the letter, so fail cleanly before
  // the stream opens instead of generating from the posting alone.
  if (!resumeText || !resumeText.trim()) {
    throw new ApiError(
      "BAD_REQUEST",
      "We couldn't read that resume. Pick another resume — a text-based PDF or DOCX works best (scanned or image-only files can't be read).",
    )
  }

  return {
    job: {
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      employmentType: job.employmentType,
      workplaceType: job.workplaceType,
    },
    resumeText,
    instructions: input.instructions,
  }
}
