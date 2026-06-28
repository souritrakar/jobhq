/**
 * Curated prototype label sets for the tiered (non-LLM) extractor — pure data, no I/O.
 *
 * These are the SEMANTIC anchors the embeddings tiers match against, the same way the autofill
 * matcher (lib/application/field-matching.ts) matches saved questions to live fields. Two uses:
 *
 *   1. Job details, tier 2: map a page's `{key, value}` segments to one of the four attribute fields
 *      by embedding the segment KEY and taking its nearest FIELD_PROTOTYPES set. Free-text enum values
 *      are then snapped to EMPLOYMENT_ENUM / WORKPLACE_ENUM (the same vocab the LLM prompt uses).
 *   2. Application questions: an inclusion GATE — a harvested field is kept iff its label is closer to
 *      QUESTION_PROTOTYPES than to NOISE_PROTOTYPES. This replaces the LLM's "is this a real application
 *      question?" judgment with nearest-prototype classification, which generalizes across phrasings far
 *      better than a keyword list (a novel essay prompt still lands near "Cover letter").
 *
 * Everything here is intentionally small (tens of short labels) and generic — NO site-specific strings.
 * Tune by editing these sets; there is no other place extraction behavior is "trained".
 *
 * NOTE: the enum strings below MUST stay byte-identical to the controlled vocab in
 * lib/llm/extraction.ts's FIELD_GUIDE (employmentType / workplaceType), so the two extractors produce
 * the same enum values. The question prototypes intentionally mirror — and broaden — the autofill
 * profile fields in lib/server/autofill.ts (PROFILE_AUTOFILL_FIELDS).
 */

export type AttributeField = "salary" | "location" | "employmentType" | "workplaceType"

/** Synonyms for the KEY half of a page `{key, value}` segment, per attribute field (tier 2, details). */
export const FIELD_PROTOTYPES: Record<AttributeField, string[]> = {
  salary: [
    "salary",
    "salary range",
    "compensation",
    "compensation range",
    "pay",
    "pay range",
    "pay rate",
    "base pay",
    "base salary",
    "annual salary",
    "remuneration",
    "wage",
    "expected salary",
  ],
  location: [
    "location",
    "job location",
    "work location",
    "office location",
    "based in",
    "place of work",
    "city",
    "region",
  ],
  employmentType: [
    "employment type",
    "job type",
    "contract type",
    "position type",
    "type of employment",
    "schedule",
    "work type",
    "engagement type",
  ],
  workplaceType: [
    "workplace type",
    "work arrangement",
    "work setting",
    "remote policy",
    "location type",
    "remote",
    "hybrid",
    "on-site",
    "remote or on-site",
  ],
}

/** Controlled vocab for employmentType — MUST match lib/llm/extraction.ts FIELD_GUIDE exactly. */
export const EMPLOYMENT_ENUM = [
  "Full-time",
  "Part-time",
  "Contract",
  "Internship",
  "Temporary",
  "Freelance",
  "Volunteer",
  "Apprenticeship",
] as const

/** Controlled vocab for workplaceType — MUST match lib/llm/extraction.ts FIELD_GUIDE exactly. */
export const WORKPLACE_ENUM = ["Remote", "Hybrid", "On-site"] as const

/**
 * What a real application-form question looks like, semantically. Mirrors + broadens the autofill
 * profile fields (lib/server/autofill.ts) and adds the common free-entry / choice / consent archetypes
 * every ATS asks in some wording. The gate keeps a field when its label is nearest THIS set.
 */
export const QUESTION_PROTOTYPES: string[] = [
  // identity & contact
  "Full name",
  "First name",
  "Last name",
  "Preferred name",
  "Email address",
  "Phone number",
  "Street address",
  "City",
  "State or province",
  "Postal or ZIP code",
  "Country",
  "Pronouns",
  // links
  "LinkedIn profile URL",
  "Portfolio or personal website URL",
  "GitHub profile URL",
  // experience & role
  "Current job title",
  "Current company",
  "Years of experience",
  "Years of experience with this technology",
  "Describe your relevant experience",
  // motivation / free entry
  "Why do you want to work here",
  "Cover letter",
  "Tell us about yourself",
  "Additional information or comments",
  // logistics
  "Salary expectations",
  "Desired salary",
  "Notice period",
  "Available start date",
  "How did you hear about us",
  // authorization
  "Are you legally authorized to work",
  "Do you require visa sponsorship",
  "Work authorization status",
  // files
  "Upload your resume or CV",
  "Attach a cover letter",
  // voluntary self-identification (EEO)
  "Gender",
  "Race or ethnicity",
  "Veteran status",
  "Disability status",
  // application consent (distinct from cookie/marketing consent in NOISE_PROTOTYPES)
  "I agree to the terms and conditions",
  "I consent to the processing of my application data",
  "I certify that the information provided is accurate",
]

/**
 * What page noise looks like, semantically: site search, auth, marketing opt-in, cookie banners, and
 * social/share chrome. A field nearest THIS set (vs QUESTION_PROTOTYPES) is dropped. Keeping the
 * archetypes broad — not exact strings — is what makes the gate robust to wording drift.
 */
export const NOISE_PROTOTYPES: string[] = [
  // site search / filtering
  "Search jobs",
  "Search this site",
  "Filter results",
  "Sort results by",
  // authentication
  "Sign in",
  "Log in to your account",
  "Create an account",
  "Username",
  "Password",
  "Forgot your password",
  // marketing opt-in
  "Subscribe to our newsletter",
  "Sign up for job alerts",
  "Email me similar jobs",
  // cookie / privacy banner
  "Accept all cookies",
  "Manage cookie preferences",
  // social / share chrome
  "Share this job",
  "Follow us on social media",
  "Back to search results",
  "Save this job for later",
  // promo
  "Enter a promo or coupon code",
]
