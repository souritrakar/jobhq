import { ApiError } from "@/lib/api/errors"
import type { ApplicationQuestion } from "@/lib/llm/application-extraction"
import { scrapeStructured } from "@/lib/llm/firecrawl"
import {
  APPLICATION_IMPORT_PROMPT,
  APPLICATION_IMPORT_SCHEMA,
  JOB_IMPORT_PROMPT,
  JOB_IMPORT_SCHEMA,
  mapApplicationExtraction,
  mapExtraction,
  pickLogoUrl,
  type FirecrawlApplicationJson,
  type FirecrawlJobJson,
} from "@/lib/llm/job-import-extraction"
import { createJob, updateJob } from "@/lib/server/jobs"
import { applicationInputSchema, createJobSchema } from "@/lib/validations/job"

/** A saved job with its (optional) application form attached — what createJob/updateJob return. */
type JobWithApplication = Awaited<ReturnType<typeof createJob>>

/**
 * The outcome of an import. A job posting yields `saved` (the job, with any questions attached);
 * a bare apply page — details on a different URL — yields `application_only` (the questions, for
 * the client to carry to the job posting URL). "Found neither" is a thrown 400, not an outcome.
 */
export type ImportResult =
  | { outcome: "saved"; job: JobWithApplication }
  | { outcome: "application_only"; questions: ApplicationQuestion[] }

/**
 * Import a job from a posting URL — the web app's "save a job without the extension" path.
 *
 * ONE Firecrawl scrape does the structured extraction (its own LLM) plus branding/logo, so this
 * adds no Groq spend. The result is mapped through the SAME normalizers and `createJobSchema` the
 * extension uses, then handed to the SAME `createJob` service — so the saved record (dedup-by-URL,
 * application questions, validation) is identical to any other save. `createJob` is idempotent per
 * URL: re-importing updates the job and preserves its pipeline status.
 *
 * Job details and the application form sometimes live on DIFFERENT URLs (e.g. Ashby renders the
 * form at `…/<id>/application`). Two cases the single scrape can hit:
 *   - The page is an apply form with no job identity → return `application_only` so the UI can ask
 *     for the job posting URL. `carryQuestions` is how those questions come back on that retry.
 *   - The page has job details but no form → save the job; the UI then offers to attach the form
 *     from a second URL via `attachApplicationFromUrl`.
 */
export async function importJobFromUrl(
  userId: string,
  url: string,
  carryQuestions?: ApplicationQuestion[],
): Promise<ImportResult> {
  const result = await scrapeStructured<FirecrawlJobJson>(url, {
    schema: JOB_IMPORT_SCHEMA,
    prompt: JOB_IMPORT_PROMPT,
    branding: true,
  })

  const { fields, questions } = mapExtraction(result.json)

  // No job identity on the page. If we still found an application form, this is an apply page
  // (a separate route from the posting): hand the questions back so the client can supply the
  // job posting URL and we attach them to it. If we found neither, the link wasn't a posting at
  // all (a careers index, a login wall, an unrelated page) — a client-correctable 400.
  if (!fields.title || !fields.company) {
    if (questions.length > 0) return { outcome: "application_only", questions }
    throw new ApiError(
      "BAD_REQUEST",
      "We couldn't find a job title and company at that link. Make sure it points directly to a single job posting.",
    )
  }

  // Prefer the form found on THIS page; fall back to any carried over from a prior apply-page
  // scrape (the "found the form first, then the job posting" flow).
  const application = pickApplication(questions, carryQuestions)
  const logoUrl = pickLogoUrl(result.branding, url)

  // Reuse the exact validation the extension save uses; "" is the schema's "no logo" value.
  const input = createJobSchema.parse({
    title: fields.title,
    company: fields.company,
    url,
    location: fields.location,
    description: fields.description,
    salary: fields.salary,
    employmentType: fields.employmentType,
    workplaceType: fields.workplaceType,
    source: sourceFromUrl(url),
    logoUrl: logoUrl ?? "",
    status: "SAVED",
    ...(application ? { application } : {}),
  })

  const job = await createJob(userId, input)
  return { outcome: "saved", job }
}

/**
 * Attach the application form from a SECOND URL to a job we already saved — the "the apply form
 * is on a separate page" case. Scrapes that page with the application-only config (no job-posting
 * gate), then upserts the questions onto the job (replacing any it had). `updateJob` enforces user
 * ownership (404 otherwise). Throws a 400 when the page has no form, so the UI can prompt a retry.
 */
export async function attachApplicationFromUrl(
  userId: string,
  jobId: string,
  url: string,
): Promise<JobWithApplication> {
  const result = await scrapeStructured<FirecrawlApplicationJson>(url, {
    schema: APPLICATION_IMPORT_SCHEMA,
    prompt: APPLICATION_IMPORT_PROMPT,
  })

  const questions = mapApplicationExtraction(result.json)
  if (questions.length === 0) {
    throw new ApiError(
      "BAD_REQUEST",
      "We couldn't find any application questions at that link. Make sure it points to the job's application form.",
    )
  }

  // Re-validate the normalized questions before they reach the DB, then upsert via the same path
  // a re-extraction uses. status/other fields are untouched — only the form is written.
  const application = applicationInputSchema.parse({ questions })
  return updateJob(userId, jobId, { application })
}

// Use the form found on the page, else the carried-over set; undefined when there's nothing to
// attach (keeps an empty form from being persisted).
function pickApplication(
  found: ApplicationQuestion[],
  carried: ApplicationQuestion[] | undefined,
): { questions: ApplicationQuestion[] } | undefined {
  const questions = found.length > 0 ? found : (carried ?? [])
  return questions.length > 0 ? { questions } : undefined
}

// Provenance for the saved job, e.g. "linkedin.com", "boards.greenhouse.io". Mirrors how the
// extension stamps `source`; undefined if the URL somehow doesn't parse (it's validated first).
function sourceFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return undefined
  }
}
