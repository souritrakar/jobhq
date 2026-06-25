import { z } from "zod"

/**
 * Input validation for the cover-letter generator (POST /api/cover-letter).
 *
 * The client sends the saved job to write for, an optional resume selection, and optional
 * free-text instructions. The job itself is loaded server-side from the DB (user-scoped), so
 * only its id crosses the wire — the client can't smuggle in a job it doesn't own.
 */
export const generateCoverLetterSchema = z.object({
  // Which saved job to write the letter for. Loaded + ownership-checked server-side.
  jobId: z.string().min(1, "A job is required"),
  // Which resume to ground the letter in — a document id. Optional: absent → a less-personalized
  // letter. Resolved (and ownership-checked) server-side via lib/server/resumes.ts; a foreign or
  // unparseable id resolves to "no resume" rather than erroring.
  resumeId: z.string().min(1).optional(),
  // Free-text tone/emphasis/length notes, e.g. "keep it under 250 words, formal tone".
  instructions: z.string().trim().max(2000).optional(),
})

export type GenerateCoverLetterInput = z.infer<typeof generateCoverLetterSchema>
