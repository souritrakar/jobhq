import { z } from "zod"

import { applicationInputSchema } from "@/lib/validations/job"

// A posting URL the user pastes. The 2000-char cap matches the `url`/`logoUrl` limits in the
// jobs schema; trimming + scheme validation reject obvious junk before we spend a scrape.
const postingUrl = z.string().trim().url("Enter a valid job posting URL").max(2000)

/**
 * Input validation for POST /api/jobs/import.
 *
 * The web app sends the posting URL; the server does the Firecrawl scrape + save. `carryQuestions`
 * is the "found the application form but not the job details" case (see job-import.ts): the
 * client holds the questions from a first scrape and sends them back with the job posting URL so
 * we can attach them to the job we create — re-validated here so nothing unchecked reaches the DB.
 */
export const importJobSchema = z.object({
  url: postingUrl,
  carryQuestions: applicationInputSchema.shape.questions.optional(),
})

/**
 * Input validation for POST /api/jobs/:id/application — attach a separate apply page's form to
 * an already-saved job ("found the job details but not the application form" case).
 */
export const attachApplicationSchema = z.object({
  url: postingUrl,
})

export type ImportJobInput = z.infer<typeof importJobSchema>
export type AttachApplicationInput = z.infer<typeof attachApplicationSchema>
