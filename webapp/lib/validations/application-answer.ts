import { z } from "zod"

/**
 * Input validation for application answers and AI drafting (the job detail page's application form).
 * `questionId` is the stable slug the service assigned the question (see shapeStoredQuestions); the
 * client reads it off the rendered question and echoes it back to address its answer.
 */

// A question id is a slug (≤ 60 chars) plus an optional dedupe suffix; keep the bound generous.
const questionId = z.string().trim().min(1).max(80)

// Generous cap per answer: long-form answers (essays, "tell us about a project") can run long, but
// this bounds a runaway paste. Empty string is allowed and means "clear this answer".
const answerValue = z.string().max(20_000)

/**
 * PUT /api/jobs/:id/application/answers — save a batch of answers in one request (manual save).
 * Each entry upserts one question's answer; an empty `value` clears it. A bounded array keeps a
 * single Save click to one transaction (a form realistically has well under 200 questions).
 */
export const saveAnswersSchema = z.object({
  answers: z.array(z.object({ questionId, value: answerValue })).max(200),
})

/** POST /api/jobs/:id/application/draft — draft one question's answer with AI. */
export const draftAnswerSchema = z.object({
  questionId,
})

export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>
export type DraftAnswerInput = z.infer<typeof draftAnswerSchema>
