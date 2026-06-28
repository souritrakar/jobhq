import { z } from "zod"

import {
  DISABILITY_STATUS_OPTIONS,
  GENDER_OPTIONS,
  NOTICE_PERIOD_OPTIONS,
  PRONOUN_OPTIONS,
  RACE_ETHNICITY_OPTIONS,
  REMOTE_PREFERENCE_OPTIONS,
  VETERAN_STATUS_OPTIONS,
  WORK_AUTHORIZATION_OPTIONS,
} from "@/components/dashboard/settings/profile-settings"

/**
 * Input validation for the autofill profile API (`PUT /api/profile`). Single source of truth for
 * what the Settings form may send; the inferred type flows into the service layer so DB writes are
 * shape-checked. Mirrors the `ProfileSettings` shape (profile-settings.ts) field-for-field.
 *
 * Every field is OPTIONAL — the form sends the whole object, but a partial PUT is also valid. Free
 * text is trimmed and length-capped; constrained fields (pronouns, work auth, …) are validated
 * against the same `*_OPTIONS` value sets the UI offers, allowing "" to mean "cleared/unset" (the
 * service normalizes empty strings to NULL). These are plain strings, not DB enums, so the option
 * lists can evolve without a migration.
 */

const TEXT_MAX = 200

// A trimmed, optional free-text field capped at TEXT_MAX. "" is allowed (means "unset").
const text = z.string().trim().max(TEXT_MAX).optional()

// A URL field that's forgiving about how people actually type links: "" (unset), or a URL with
// or without a scheme. A bare host like "linkedin.com/in/you" is normalized to "https://…" before
// validation, so the saved value is always a well-formed URL and the form doesn't reject the most
// common input. Length is capped after normalization.
const urlText = z
  .string()
  .trim()
  .transform((v) => (v === "" || /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.union([z.literal(""), z.string().url().max(TEXT_MAX)]))
  .optional()

// A constrained field: "" (unset) or one of the option set's values. Defends the DB against any
// value the UI doesn't offer, without coupling to a DB enum.
function oneOf(options: { value: string }[]) {
  const allowed = new Set(options.map((o) => o.value))
  return z
    .string()
    .trim()
    .refine((v) => v === "" || allowed.has(v), { message: "Unsupported value" })
    .optional()
}

export const profileSchema = z.object({
  // Personal details
  firstName: text,
  lastName: text,
  preferredName: text,
  pronouns: oneOf(PRONOUN_OPTIONS),
  email: z.union([z.literal(""), z.string().trim().email().max(TEXT_MAX)]).optional(),
  phone: text,

  // Location & address
  country: text,
  state: text,
  city: text,
  postalCode: text,
  streetAddress: text,
  addressLine2: text,

  // Work eligibility
  workAuthorization: oneOf(WORK_AUTHORIZATION_OPTIONS),
  requiresSponsorship: z.boolean().optional(),
  visaStatus: text,

  // Professional links
  linkedinUrl: urlText,
  portfolioUrl: urlText,
  githubUrl: urlText,

  // Job preferences
  currentTitle: text,
  currentCompany: text,
  desiredSalary: text,
  salaryCurrency: text,
  noticePeriod: oneOf(NOTICE_PERIOD_OPTIONS),
  // A calendar label (YYYY-MM-DD) or "" — stored as a string, no TZ math.
  earliestStartDate: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")])
    .optional(),
  remotePreference: oneOf(REMOTE_PREFERENCE_OPTIONS),
  openToRelocation: z.boolean().optional(),

  // Voluntary self-identification (EEO — optional)
  gender: oneOf(GENDER_OPTIONS),
  raceEthnicity: oneOf(RACE_ETHNICITY_OPTIONS),
  veteranStatus: oneOf(VETERAN_STATUS_OPTIONS),
  disabilityStatus: oneOf(DISABILITY_STATUS_OPTIONS),
})

export type ProfileInput = z.infer<typeof profileSchema>
