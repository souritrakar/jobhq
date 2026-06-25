import { z } from "zod"

import { APPLICATION_FIELD_TYPES } from "@/lib/llm/application-extraction"

/**
 * Input validation for the jobs API. These schemas are the single source of truth
 * for what the extension and web app are allowed to send; the inferred types flow
 * into the service layer so DB writes are always shape-checked.
 */
export const jobStatusSchema = z.enum([
  "SAVED",
  "APPLIED",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "ARCHIVED",
])

// Coerce empty strings to undefined so the extension can send "" for blank fields.
const optionalText = z
  .string()
  .trim()
  .max(10_000)
  .optional()
  .transform((v) => (v === "" ? undefined : v))

/**
 * One application-form question as the extension sends it (the cached extraction output).
 * Mirrors ApplicationQuestion in lib/llm/application-extraction.ts — the field-type list is
 * imported from there so the LLM, validation, and storage agree on the allowed types. The
 * server assigns each question a stable `id` and `order` before persisting; clients don't
 * send those. The type set is open by design: select/radio cover MCQ, number covers numeric,
 * file covers uploads, etc.
 */
const applicationQuestionSchema = z.object({
  label: z.string().trim().min(1).max(400),
  type: z.enum(APPLICATION_FIELD_TYPES),
  placeholder: z.string().trim().max(300).optional(),
  helpText: z.string().trim().max(300).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(300)).max(40).optional(),
  // User-set: this question is starred for later review. Set in the save panel, persisted so
  // the web app (and future reminders) can surface what the user flagged as important.
  flagged: z.boolean().optional(),
})

/**
 * The optional application form captured alongside a job. The extension includes this ONLY
 * when the user extracted application data — an absent field (or an empty `questions` array)
 * means nothing application-related is persisted for the job.
 */
export const applicationInputSchema = z.object({
  questions: z.array(applicationQuestionSchema).max(60),
})

export const createJobSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  company: z.string().trim().min(1, "Company is required").max(500),
  url: z.string().url().max(2000).optional().or(z.literal("")),
  location: optionalText,
  description: optionalText,
  // Captured company logo URL. Validated as a URL like `url`; "" allowed for "none".
  logoUrl: z.string().url().max(2000).optional().or(z.literal("")),
  source: optionalText,
  // Structured details from the extractor (already normalized/formatted upstream).
  salary: optionalText,
  employmentType: optionalText,
  workplaceType: optionalText,
  status: jobStatusSchema.optional(),
  // Accept ISO strings (what JSON carries) and turn them into Date objects.
  deadline: z.coerce.date().optional(),
  // Scheduled interview time. `null` clears it (and removes the auto interview reminder); omitted
  // leaves it untouched.
  interviewAt: z.coerce.date().nullable().optional(),
  notes: optionalText,
  // The user's chosen resume for this job (a Document id), set from the detail page. `null`
  // clears the selection; omitted leaves it untouched. Ownership is verified in the service.
  resumeDocumentId: z.string().trim().min(1).max(64).nullable().optional(),
  // Optional application form (questions). Omitted unless the user extracted it.
  application: applicationInputSchema.optional(),
})

// Every field optional for PATCH, but at least one must be present.
export const updateJobSchema = createJobSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Provide at least one field to update" },
)

export const listJobsQuerySchema = z.object({
  status: jobStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(), // job id to paginate after
})

export type CreateJobInput = z.infer<typeof createJobSchema>
export type UpdateJobInput = z.infer<typeof updateJobSchema>
export type ApplicationInput = z.infer<typeof applicationInputSchema>
export type ApplicationQuestionInput = z.infer<typeof applicationQuestionSchema>
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>
