// Shape of the autofill profile shown on the Settings page. This is the single
// source of truth the future schema/API will mirror — keep field names stable.
// All fields are optional strings (or booleans) so a brand-new user starts empty
// and fills in only what they want. Constrained fields use the option lists below.

export type ProfileSettings = {
  // Personal details
  firstName: string
  lastName: string
  preferredName: string
  pronouns: string
  email: string
  phone: string

  // Location & address
  country: string
  state: string
  city: string
  postalCode: string
  streetAddress: string
  addressLine2: string

  // Work eligibility
  workAuthorization: string
  requiresSponsorship: boolean
  visaStatus: string

  // Professional links
  linkedinUrl: string
  portfolioUrl: string
  githubUrl: string

  // Job preferences
  currentTitle: string
  currentCompany: string
  desiredSalary: string
  salaryCurrency: string
  noticePeriod: string
  earliestStartDate: string
  remotePreference: string
  openToRelocation: boolean

  // Voluntary self-identification (EEO — optional)
  gender: string
  raceEthnicity: string
  veteranStatus: string
  disabilityStatus: string
}

export const EMPTY_PROFILE: ProfileSettings = {
  firstName: "",
  lastName: "",
  preferredName: "",
  pronouns: "",
  email: "",
  phone: "",
  country: "",
  state: "",
  city: "",
  postalCode: "",
  streetAddress: "",
  addressLine2: "",
  workAuthorization: "",
  requiresSponsorship: false,
  visaStatus: "",
  linkedinUrl: "",
  portfolioUrl: "",
  githubUrl: "",
  currentTitle: "",
  currentCompany: "",
  desiredSalary: "",
  salaryCurrency: "",
  noticePeriod: "",
  earliestStartDate: "",
  remotePreference: "",
  openToRelocation: false,
  gender: "",
  raceEthnicity: "",
  veteranStatus: "",
  disabilityStatus: "",
}

type Option = { value: string; label: string }

export const PRONOUN_OPTIONS: Option[] = [
  { value: "she/her", label: "She / Her" },
  { value: "he/him", label: "He / Him" },
  { value: "they/them", label: "They / Them" },
  { value: "self-describe", label: "Prefer to self-describe" },
  { value: "undisclosed", label: "Prefer not to say" },
]

export const WORK_AUTHORIZATION_OPTIONS: Option[] = [
  { value: "authorized", label: "Authorized to work" },
  { value: "not-authorized", label: "Not currently authorized" },
]

export const REMOTE_PREFERENCE_OPTIONS: Option[] = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
  { value: "flexible", label: "Flexible / No preference" },
]

export const NOTICE_PERIOD_OPTIONS: Option[] = [
  { value: "immediate", label: "Immediately" },
  { value: "1-week", label: "1 week" },
  { value: "2-weeks", label: "2 weeks" },
  { value: "1-month", label: "1 month" },
  { value: "2-months", label: "2 months" },
  { value: "3-months", label: "3 months" },
]

export const CURRENCY_OPTIONS: Option[] = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "INR", label: "INR" },
  { value: "CAD", label: "CAD" },
  { value: "AUD", label: "AUD" },
  { value: "other", label: "Other" },
]

export const GENDER_OPTIONS: Option[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non-binary", label: "Non-binary" },
  { value: "self-describe", label: "Prefer to self-describe" },
  { value: "undisclosed", label: "Prefer not to say" },
]

// US EEO race/ethnicity categories, kept as the canonical voluntary self-ID set.
export const RACE_ETHNICITY_OPTIONS: Option[] = [
  { value: "hispanic-latino", label: "Hispanic or Latino" },
  { value: "white", label: "White" },
  { value: "black", label: "Black or African American" },
  { value: "asian", label: "Asian" },
  { value: "pacific-islander", label: "Native Hawaiian or Other Pacific Islander" },
  { value: "native-american", label: "American Indian or Alaska Native" },
  { value: "two-or-more", label: "Two or more races" },
  { value: "undisclosed", label: "Prefer not to say" },
]

export const VETERAN_STATUS_OPTIONS: Option[] = [
  { value: "not-veteran", label: "I am not a protected veteran" },
  { value: "veteran", label: "I am a protected veteran" },
  { value: "undisclosed", label: "Prefer not to say" },
]

export const DISABILITY_STATUS_OPTIONS: Option[] = [
  { value: "yes", label: "Yes, I have / previously had a disability" },
  { value: "no", label: "No, I do not have a disability" },
  { value: "undisclosed", label: "Prefer not to answer" },
]
