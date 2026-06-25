import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"

/**
 * Application answers service / repository layer (userId-scoped, like the rest of lib/server/*).
 *
 * Answers live in their own table (JobApplicationAnswer), keyed by (applicationId, questionId), NOT
 * inside the questions JSON. That makes a single-answer save a one-row upsert — no rewrite of the
 * whole question array, no read-modify-write race between concurrent field edits, and a cheap read
 * (the page loads all of a form's answers in one indexed query). The questions JSON stays the
 * rarely-changing form STRUCTURE; this is the frequently-edited VALUES.
 */

/** The set of stable question ids in an application's questions JSON (the valid answer targets). */
function questionIdSet(questions: unknown): Set<string> {
  const ids = new Set<string>()
  if (!Array.isArray(questions)) return ids
  for (const q of questions) {
    if (q && typeof q === "object" && typeof (q as { id?: unknown }).id === "string") {
      ids.add((q as { id: string }).id)
    }
  }
  return ids
}

/**
 * All of a job's saved answers as a { questionId: value } map for initial render. One indexed query
 * via the application; returns {} when the job has no application form or no answers yet.
 */
export async function getApplicationAnswers(
  userId: string,
  jobId: string,
): Promise<Record<string, string>> {
  const app = await prisma.jobApplication.findFirst({
    where: { jobId, userId },
    select: { answers: { select: { questionId: true, value: true } } },
  })
  if (!app) return {}
  return Object.fromEntries(app.answers.map((a) => [a.questionId, a.value]))
}

/**
 * Save a batch of answers in ONE transaction (the page's manual "Save changes"). Each entry upserts
 * its row; a whitespace-only value clears it (deletes the row) so an emptied field doesn't leave a
 * stale answer behind. Every question id is verified against THIS job's form first, so a client
 * can't write answers to questions that don't exist — and because the whole batch shares one
 * transaction, a single bad id rejects the lot rather than persisting a partial save.
 *
 * Returns the saved values as a `{ questionId: value }` map (cleared answers map to "").
 */
export async function saveApplicationAnswers(
  userId: string,
  jobId: string,
  answers: ReadonlyArray<{ questionId: string; value: string }>,
): Promise<Record<string, string>> {
  const app = await prisma.jobApplication.findFirst({
    where: { jobId, userId },
    select: { id: true, questions: true },
  })
  if (!app) throw ApiError.notFound("This job has no application form.")

  const valid = questionIdSet(app.questions)
  for (const { questionId } of answers) {
    if (!valid.has(questionId)) {
      throw ApiError.badRequest("That question isn't part of this application form.")
    }
  }

  // Whitespace-only clears (delete); everything else upserts. Last write wins if a question id
  // somehow appears twice in the batch (the client never sends dupes).
  const toClear = answers.filter((a) => a.value.trim() === "").map((a) => a.questionId)
  const toUpsert = answers.filter((a) => a.value.trim() !== "")

  await prisma.$transaction([
    ...(toClear.length
      ? [
          prisma.jobApplicationAnswer.deleteMany({
            where: { applicationId: app.id, questionId: { in: toClear } },
          }),
        ]
      : []),
    ...toUpsert.map((a) =>
      prisma.jobApplicationAnswer.upsert({
        where: { applicationId_questionId: { applicationId: app.id, questionId: a.questionId } },
        create: { applicationId: app.id, userId, questionId: a.questionId, value: a.value },
        update: { value: a.value },
      }),
    ),
  ])

  return Object.fromEntries(answers.map((a) => [a.questionId, a.value.trim() === "" ? "" : a.value]))
}
