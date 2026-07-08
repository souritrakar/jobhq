import { z } from "zod"

/**
 * Input validation for the cover-letter generator (POST /api/cover-letter).
 *
 * The client sends the saved job to write for, the resume selection, and optional free-text
 * instructions. The job and resume are loaded server-side from the DB (user-scoped), so only
 * their ids cross the wire — the client can't smuggle in a job or document it doesn't own.
 */
export const generateCoverLetterSchema = z.object({
  // Which saved job to write the letter for. Loaded + ownership-checked server-side.
  jobId: z.string().min(1, "A job is required"),
  // Which resume to ground the letter in — a document id. REQUIRED: a resume is now mandatory so
  // the letter always has real grounding to draw on (the "no resume" branch is gone). Resolved
  // (and ownership-checked) server-side via lib/server/resumes.ts; an id that resolves to no
  // readable text is rejected there with a clear 400 rather than silently generating ungrounded.
  resumeId: z.string().min(1, "A resume is required"),
  // Free-text tone/emphasis/length notes, e.g. "keep it under 250 words, formal tone".
  instructions: z.string().trim().max(2000).optional(),
})

export type GenerateCoverLetterInput = z.infer<typeof generateCoverLetterSchema>

/**
 * Input for the output-safety check (POST /api/cover-letter/moderate). The client posts the finished
 * letter after streaming; the server classifies it (Stage 4) and returns whether it was flagged.
 * The cap matches the letter's own bound — moderation isn't a place to accept unbounded text.
 */
export const moderateLetterSchema = z.object({
  text: z.string().min(1, "Nothing to check").max(20_000),
})

export type ModerateLetterInput = z.infer<typeof moderateLetterSchema>
