import type { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/api/errors"
import { prisma } from "@/lib/db"
import { upsertInterviewReminder } from "@/lib/server/system-reminders"
import type {
  ApplicationInput,
  ApplicationQuestionInput,
  CreateJobInput,
  ListJobsQuery,
  UpdateJobInput,
} from "@/lib/validations/job"

/**
 * Jobs service / repository layer.
 *
 * All database access for jobs lives here, never in route handlers. Two rules keep
 * the product multi-tenant-safe:
 *   1. Every function takes `userId` and scopes its query to it.
 *   2. Reads/writes of a specific job filter by BOTH `id` and `userId`, so a user
 *      can never touch another user's row even if they guess an id.
 */

// Normalize "" (sent by the extension for blank URL) to null before persisting.
function normalizeUrl(url: string | undefined): string | null | undefined {
  if (url === undefined) return undefined
  return url === "" ? null : url
}

// Derive a stable, human-readable id from a question's label (e.g. "LinkedIn profile" →
// "linkedin-profile"). Stable ids let a later AI step reference a specific question.
function slugifyLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return slug || "question"
}

// Version of the stored `questions` JSON shape. Bump when the persisted shape changes so
// readers can migrate old rows. v2 added the user-set `flagged` star (+ flaggedCount).
const APPLICATION_SCHEMA_VERSION = 2

// Shape the extension's questions into the stored JSON: assign a stable id (deduped) and a
// display order, and drop falsy optionals so the JSON stays tight. This is the single place
// the persisted question shape is defined (mirrors the JobApplication doc in schema.prisma).
function shapeStoredQuestions(questions: ApplicationQuestionInput[]) {
  const counts = new Map<string, number>()
  return questions.map((q, order) => {
    const base = slugifyLabel(q.label)
    const n = (counts.get(base) ?? 0) + 1
    counts.set(base, n)
    return {
      id: n > 1 ? `${base}-${n}` : base,
      order,
      label: q.label,
      type: q.type,
      ...(q.required ? { required: true } : {}),
      ...(q.placeholder ? { placeholder: q.placeholder } : {}),
      ...(q.helpText ? { helpText: q.helpText } : {}),
      ...(q.options && q.options.length ? { options: q.options } : {}),
      ...(q.flagged ? { flagged: true } : {}),
    }
  })
}

// Count of questions the user starred for later review (denormalized onto JobApplication so
// the web app / reminders can find "jobs with flagged questions" without parsing the JSON).
function countFlagged(questions: ReadonlyArray<{ flagged?: boolean }>): number {
  return questions.reduce((n, q) => n + (q.flagged ? 1 : 0), 0)
}

// Build the nested `application.create` for a job.create, or undefined when the user didn't
// extract any application data — so an absent/empty application persists nothing.
function applicationCreate(
  userId: string,
  application: ApplicationInput | undefined,
): Prisma.JobApplicationCreateNestedOneWithoutJobInput | undefined {
  if (!application || application.questions.length === 0) return undefined
  const questions = shapeStoredQuestions(application.questions)
  return {
    create: {
      user: { connect: { id: userId } },
      questions,
      questionCount: questions.length,
      flaggedCount: countFlagged(questions),
      schemaVersion: APPLICATION_SCHEMA_VERSION,
    },
  }
}

export async function listJobs(userId: string, query: ListJobsQuery) {
  const { status, limit, cursor } = query
  return prisma.job.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  })
}

/**
 * A user's pipeline metrics for the dashboard stat strip.
 *
 * `applications` counts every job that has been submitted (applied or further along), and
 * `interviewing` counts those that reached an interview or offer.
 */
export async function getJobStats(userId: string) {
  const grouped = await prisma.job.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  })
  const byStatus = Object.fromEntries(
    grouped.map((g) => [g.status, g._count._all]),
  ) as Record<string, number>
  const total = grouped.reduce((sum, g) => sum + g._count._all, 0)

  const count = (status: string) => byStatus[status] ?? 0
  // Reaching any post-SAVED stage implies an application was submitted.
  const applications =
    count("APPLIED") + count("INTERVIEWING") + count("OFFER") + count("REJECTED")
  // An interview or offer both mean the application advanced past the apply stage.
  const interviewing = count("INTERVIEWING") + count("OFFER")

  return { total, byStatus, applications, interviewing }
}

export async function getJob(userId: string, id: string) {
  // Single-job view includes the application form (1:1, small). The list path omits it.
  const job = await prisma.job.findFirst({
    where: { id, userId },
    include: { application: true },
  })
  if (!job) throw ApiError.notFound("Job not found")
  return job
}

export async function createJob(userId: string, input: CreateJobInput) {
  const url = normalizeUrl(input.url)

  // Idempotent per posting: a job tracker should hold ONE row per URL, so re-saving the same
  // page updates that job instead of piling up duplicates. (Blank URLs can't be de-duplicated,
  // so they always create a fresh row.) This makes the extension's save safe to retry and lets
  // it flip to a "View in dashboard" state knowing the posting is already tracked.
  if (url) {
    const existing = await prisma.job.findFirst({
      where: { userId, url },
      select: { id: true },
    })
    if (existing) return resaveJob(userId, existing.id, input)
  }

  const application = applicationCreate(userId, input.application)
  const data: Prisma.JobCreateInput = {
    user: { connect: { id: userId } },
    title: input.title,
    company: input.company,
    url,
    location: input.location,
    description: input.description,
    logoUrl: normalizeUrl(input.logoUrl),
    source: input.source,
    salary: input.salary,
    employmentType: input.employmentType,
    workplaceType: input.workplaceType,
    status: input.status,
    deadline: input.deadline,
    notes: input.notes,
    // Only attached when the user extracted application questions; otherwise nothing is
    // written. The nested create runs atomically with the job in a single statement.
    ...(application ? { application } : {}),
  }
  return prisma.job.create({ data, include: { application: true } })
}

// Re-saving a posting we already track (matched by URL): refresh the captured content and the
// application form, but PRESERVE the user's pipeline status — a re-capture must never knock a
// job from Interviewing back to Saved. Only the fields the caller sent are written (undefined ⇒
// Prisma leaves the column untouched), so nothing already stored is silently dropped.
async function resaveJob(userId: string, id: string, input: CreateJobInput) {
  const application =
    input.application && input.application.questions.length > 0
      ? applicationUpsert(userId, input.application)
      : undefined
  return prisma.job.update({
    where: { id },
    data: {
      title: input.title,
      company: input.company,
      url: normalizeUrl(input.url),
      location: input.location,
      description: input.description,
      logoUrl: normalizeUrl(input.logoUrl),
      source: input.source,
      salary: input.salary,
      employmentType: input.employmentType,
      workplaceType: input.workplaceType,
      // status intentionally omitted — keep the job's current pipeline stage.
      deadline: input.deadline,
      notes: input.notes,
      ...(application ? { application } : {}),
    },
    include: { application: true },
  })
}

export async function updateJob(
  userId: string,
  id: string,
  input: UpdateJobInput,
) {
  // Ensure the job exists and belongs to the user before updating.
  await getJob(userId, id)
  // `application` is a relation, not a scalar column — handle it via upsert, never via the
  // scalar spread (which Prisma would reject). Re-extraction replaces the question set.
  const { application, resumeDocumentId, ...fields } = input
  const applicationWrite =
    application && application.questions.length > 0
      ? applicationUpsert(userId, application)
      : undefined

  // A chosen resume must be one of THIS user's own documents — never trust the id from the
  // client. `null` (clear) and `undefined` (leave) skip the check; only a set id is verified.
  if (resumeDocumentId != null) {
    const owned = await prisma.document.findFirst({
      where: { id: resumeDocumentId, userId },
      select: { id: true },
    })
    if (!owned) throw ApiError.badRequest("That resume couldn't be found.")
  }

  const updated = await prisma.job.update({
    where: { id },
    data: {
      ...fields,
      url: normalizeUrl(fields.url),
      logoUrl: normalizeUrl(fields.logoUrl),
      // Scalar FK: a string sets the selection, null clears it, undefined leaves it untouched.
      ...(resumeDocumentId !== undefined ? { resumeDocumentId } : {}),
      ...(applicationWrite ? { application: applicationWrite } : {}),
    },
    include: { application: true },
  })

  // Keep the auto "interview" SYSTEM reminder in sync with the (just-persisted) interviewAt: a date
  // creates/reschedules it, null removes it. Only when the field was part of this patch.
  if (input.interviewAt !== undefined) {
    await upsertInterviewReminder(userId, id, input.interviewAt ?? null)
  }

  return updated
}

// Build the nested `application.upsert` for a job.update: create the form if the job has none
// yet, or replace its questions if it does. Only called when there are questions to write.
function applicationUpsert(
  userId: string,
  application: ApplicationInput,
): Prisma.JobApplicationUpdateOneWithoutJobNestedInput {
  const questions = shapeStoredQuestions(application.questions)
  const flaggedCount = countFlagged(questions)
  return {
    upsert: {
      create: {
        user: { connect: { id: userId } },
        questions,
        questionCount: questions.length,
        flaggedCount,
        schemaVersion: APPLICATION_SCHEMA_VERSION,
      },
      update: {
        questions,
        questionCount: questions.length,
        flaggedCount,
        schemaVersion: APPLICATION_SCHEMA_VERSION,
      },
    },
  }
}

export async function deleteJob(userId: string, id: string) {
  await getJob(userId, id)
  await prisma.job.delete({ where: { id } })
}
