import { ApiError } from "@/lib/api/errors"
import { env } from "@/lib/env"
import {
  ANSWER_DRAFT_TEMPERATURE,
  answerDraftModelChain,
  buildAnswerDraftMessages,
  cleanDraftedAnswer,
} from "@/lib/llm/answer-draft"
import { openRouterChat } from "@/lib/llm/openrouter"
import { getJob } from "@/lib/server/jobs"
import { getResumeText } from "@/lib/server/resumes"

/**
 * AI answer-draft service. Owns the DB access (job + question lookup, user-scoped) and the resume
 * resolution, then runs ONE non-streaming OpenRouter call and returns the cleaned answer text.
 *
 * Every clean failure — job not found, no form, no resume selected, unreadable resume, a question
 * that can't be drafted — is thrown as an ApiError here, so the route returns the standard JSON
 * error envelope (the client shows it inline). A resume is REQUIRED: drafting is grounded in it.
 */

// Field types we never AI-draft: choice/upload/scalar fields (nothing to write) and identity/
// contact fields (name lives in short_text, but email/tel/url are their own types). The UI only
// shows the button on `long_text`; this is the independent server guard — never trust the client.
const NON_DRAFTABLE_TYPES = new Set([
  "select",
  "radio",
  "multi_select",
  "checkbox",
  "file",
  "date",
  "number",
  "url",
  "email",
  "tel",
])

type StoredQuestionLite = {
  id: string
  type: string
  label: string
  helpText?: string
  placeholder?: string
}

/** Find a question by its stable id in the application's questions JSON. */
function findQuestion(questions: unknown, questionId: string): StoredQuestionLite | null {
  if (!Array.isArray(questions)) return null
  for (const q of questions) {
    if (q && typeof q === "object" && (q as { id?: unknown }).id === questionId) {
      const obj = q as Record<string, unknown>
      return {
        id: questionId,
        type: typeof obj.type === "string" ? obj.type : "",
        label: typeof obj.label === "string" ? obj.label : "",
        helpText: typeof obj.helpText === "string" ? obj.helpText : undefined,
        placeholder: typeof obj.placeholder === "string" ? obj.placeholder : undefined,
      }
    }
  }
  return null
}

export async function draftApplicationAnswer(
  userId: string,
  jobId: string,
  questionId: string,
): Promise<{ value: string }> {
  // getJob enforces ownership (404s otherwise) and includes the application form.
  const job = await getJob(userId, jobId)

  const question = findQuestion(job.application?.questions, questionId)
  if (!question || !question.label) {
    throw ApiError.badRequest("That question isn't part of this application form.")
  }
  if (NON_DRAFTABLE_TYPES.has(question.type)) {
    throw ApiError.badRequest("This question can't be drafted with AI.")
  }

  // A resume is required — the draft is grounded in it. Match the UI gate so the messages agree.
  if (!job.resumeDocumentId) {
    throw ApiError.badRequest("Select a resume first, then draft your answer.")
  }
  const resumeText = await getResumeText(userId, job.resumeDocumentId)
  if (!resumeText) {
    throw ApiError.badRequest(
      "We couldn't read text from your selected resume. Try a PDF or DOCX, then draft again.",
    )
  }

  const messages = buildAnswerDraftMessages({
    job: {
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      employmentType: job.employmentType,
      workplaceType: job.workplaceType,
    },
    question: {
      label: question.label,
      helpText: question.helpText,
      placeholder: question.placeholder,
    },
    resumeText,
  })

  const result = await openRouterChat(messages, {
    models: answerDraftModelChain(env.AI_DRAFT_MODEL, env.AI_DRAFT_FALLBACK_MODELS),
    temperature: ANSWER_DRAFT_TEMPERATURE,
    maxTokens: env.AI_DRAFT_MAX_TOKENS,
    title: "JobTracker - AI Draft",
  })

  return { value: cleanDraftedAnswer(result.content) }
}
