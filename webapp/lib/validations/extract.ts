import { z } from "zod"

/**
 * Input validation for POST /api/extract.
 *
 * `text` is the posting's readable page text the extension captured — capped so a
 * runaway scrape can't blow up the request. The model reads it and returns the fields
 * (and a cleaned description) in one call. `source`/`url` are metadata logged with the
 * extraction for later cost/perf analysis.
 */
export const extractInputSchema = z.object({
  text: z.string().trim().min(1, "text is required").max(60_000),
  source: z.string().trim().max(255).optional(),
  url: z.string().trim().max(2000).optional(),
})

export type ExtractInput = z.infer<typeof extractInputSchema>

/**
 * Input validation for POST /api/extract-application.
 *
 * Same shape as job extraction — the extension captures the rendered application form as
 * readable page text and sends it here; the model returns the form's questions. `source`/
 * `url` are logged metadata. Kept as a separate schema so the two endpoints can diverge.
 */
export const applicationExtractInputSchema = extractInputSchema

export type ApplicationExtractInput = z.infer<typeof applicationExtractInputSchema>
