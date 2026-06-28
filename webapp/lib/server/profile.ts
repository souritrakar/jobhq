import type { Prisma, UserProfile } from "@prisma/client"

import { prisma } from "@/lib/db"
import { EMPTY_PROFILE, type ProfileSettings } from "@/components/dashboard/settings/profile-settings"
import type { ProfileInput } from "@/lib/validations/profile"

/**
 * Autofill-profile service / repository layer (see docs/SETTINGS.md).
 *
 * All database access for the user's autofill profile lives here, never in route handlers. The 1:1
 * `UserProfile` row is keyed by `userId`, so every read/write is naturally user-scoped — a user can
 * only ever touch their own profile.
 *
 * Wire shape: the client speaks the `ProfileSettings` shape (all strings, two booleans). The DB
 * columns are nullable; `toClientProfile` maps NULL → "" so the form's controlled inputs always get
 * a string, and the writer maps "" → NULL so the table stays clean.
 */

// The text (string) fields, in ProfileSettings order. The two booleans are handled separately.
const TEXT_KEYS = [
  "firstName",
  "lastName",
  "preferredName",
  "pronouns",
  "email",
  "phone",
  "country",
  "state",
  "city",
  "postalCode",
  "streetAddress",
  "addressLine2",
  "workAuthorization",
  "visaStatus",
  "linkedinUrl",
  "portfolioUrl",
  "githubUrl",
  "currentTitle",
  "currentCompany",
  "desiredSalary",
  "salaryCurrency",
  "noticePeriod",
  "earliestStartDate",
  "remotePreference",
  "gender",
  "raceEthnicity",
  "veteranStatus",
  "disabilityStatus",
] as const satisfies readonly (keyof ProfileSettings)[]

const BOOL_KEYS = ["requiresSponsorship", "openToRelocation"] as const satisfies readonly (keyof ProfileSettings)[]

/** Prisma row → the client `ProfileSettings` shape: NULL text columns become "" so inputs stay controlled. */
export function toClientProfile(row: UserProfile): ProfileSettings {
  const out = { ...EMPTY_PROFILE }
  for (const key of TEXT_KEYS) out[key] = row[key] ?? ""
  for (const key of BOOL_KEYS) out[key] = row[key]
  return out
}

/** The user's saved profile, or null if they haven't saved one yet (the page then seeds identity). */
export async function getProfile(userId: string): Promise<ProfileSettings | null> {
  const row = await prisma.userProfile.findUnique({ where: { userId } })
  return row ? toClientProfile(row) : null
}

// ProfileInput (validated, partial) → Prisma write data: only provided keys, "" normalized to NULL.
function toWriteData(input: ProfileInput): Record<string, string | boolean | null> {
  const data: Record<string, string | boolean | null> = {}
  for (const key of TEXT_KEYS) {
    const v = input[key]
    if (v !== undefined) data[key] = v === "" ? null : v
  }
  for (const key of BOOL_KEYS) {
    const v = input[key]
    if (v !== undefined) data[key] = v
  }
  return data
}

/** Create or replace the user's profile from a (validated) form submission. Returns the saved shape. */
export async function upsertProfile(userId: string, input: ProfileInput): Promise<ProfileSettings> {
  const data = toWriteData(input)
  const row = await prisma.userProfile.upsert({
    where: { userId },
    create: Object.assign({ userId }, data) as Prisma.UserProfileUncheckedCreateInput,
    update: data as Prisma.UserProfileUncheckedUpdateInput,
  })
  return toClientProfile(row)
}
