import {
  buildCoverLetterMessages,
  COVER_LETTER_MAX_TOKENS,
  COVER_LETTER_TEMPERATURE,
} from "@/lib/llm/cover-letter"
import type { ChatMessage } from "@/lib/llm/extraction"
import { getJob } from "@/lib/server/jobs"
import { getResumeText } from "@/lib/server/resumes"
import type { GenerateCoverLetterInput } from "@/lib/validations/cover-letter"

/**
 * Cover-letter generation service.
 *
 * Owns the DB access (loading the job, user-scoped) and resume resolution, then hands the route a
 * ready-to-stream request: the chat messages + the model knobs. Keeping the streaming itself in the
 * transport (lib/llm/openrouter-stream.ts) means every failure that CAN be a clean JSON error — job
 * not found, bad input — is thrown HERE, before any bytes are sent.
 *
 * Resume content comes from the user's uploaded documents (lib/server/resumes.ts), parsed to text.
 * An absent, foreign, or unparseable resumeId resolves to null, so the letter is generated in the
 * less-personalized mode rather than failing.
 */

export type PreparedCoverLetter = {
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
}

export async function prepareCoverLetter(
  userId: string,
  input: GenerateCoverLetterInput,
): Promise<PreparedCoverLetter> {
  // getJob enforces ownership (throws 404 otherwise) and includes nothing the letter doesn't need.
  const job = await getJob(userId, input.jobId)

  const resumeText = input.resumeId ? await getResumeText(userId, input.resumeId) : null

  const messages = buildCoverLetterMessages({
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
  })

  return {
    messages,
    temperature: COVER_LETTER_TEMPERATURE,
    maxTokens: COVER_LETTER_MAX_TOKENS,
  }
}
