// Hardcoded demo data so the dashboard renders independently of the database
// (which is being cleared). Mirrors the Prisma `Job` shape closely enough for the
// UI; swap this import for the real `/api/jobs` fetch once data is flowing.
//
// `logoSlug` maps to a real brand mark in BRAND_LOGOS (see components/landing/
// brand-logo.tsx); unknown slugs fall back to a clean monogram chip.

export type JobStatus =
  | "SAVED"
  | "APPLIED"
  | "INTERVIEWING"
  | "OFFER"
  | "REJECTED"
  | "ARCHIVED"

export type Job = {
  id: string
  title: string
  company: string
  logoSlug: string
  location: string
  source: string
  status: JobStatus
  url: string
  /** ISO date — when the posting closes, or null if none captured. */
  deadline: string | null
  /** ISO date — when the user saved it. */
  savedAt: string
  salary?: string
}

// Anchored to "today" = 2026-06-19 so relative dates ("3d left", "saved 2d ago")
// stay stable and sensible in the demo.
export const MOCK_JOBS: Job[] = [
  {
    id: "j1",
    title: "Senior Frontend Engineer",
    company: "Stripe",
    logoSlug: "stripe",
    location: "Remote · US",
    source: "greenhouse",
    status: "INTERVIEWING",
    url: "https://stripe.com/jobs",
    deadline: "2026-06-22",
    savedAt: "2026-06-10",
    salary: "$180k – $230k",
  },
  {
    id: "j2",
    title: "Product Designer, Growth",
    company: "Linear",
    logoSlug: "linear",
    location: "San Francisco, CA",
    source: "ashby",
    status: "APPLIED",
    url: "https://linear.app/careers",
    deadline: "2026-06-25",
    savedAt: "2026-06-12",
    salary: "$150k – $190k",
  },
  {
    id: "j3",
    title: "Full-Stack Engineer (React / Node)",
    company: "Vercel",
    logoSlug: "vercel",
    location: "Remote",
    source: "lever",
    status: "SAVED",
    url: "https://vercel.com/careers",
    deadline: "2026-06-21",
    savedAt: "2026-06-18",
    salary: "$165k – $210k",
  },
  {
    id: "j4",
    title: "Software Engineer, Platform",
    company: "Notion",
    logoSlug: "notion",
    location: "New York, NY",
    source: "linkedin",
    status: "SAVED",
    url: "https://notion.so/careers",
    deadline: "2026-07-03",
    savedAt: "2026-06-17",
  },
  {
    id: "j5",
    title: "Design Engineer",
    company: "Figma",
    logoSlug: "figma",
    location: "Remote · US",
    source: "greenhouse",
    status: "OFFER",
    url: "https://figma.com/careers",
    deadline: null,
    savedAt: "2026-06-02",
    salary: "$170k – $215k",
  },
  {
    id: "j6",
    title: "Backend Engineer, Payments",
    company: "Ramp",
    logoSlug: "ramp",
    location: "New York, NY",
    source: "ashby",
    status: "APPLIED",
    url: "https://ramp.com/careers",
    deadline: "2026-06-28",
    savedAt: "2026-06-14",
    salary: "$175k – $220k",
  },
  {
    id: "j7",
    title: "New Grad Software Engineer",
    company: "Wellfound",
    logoSlug: "wellfound",
    location: "Remote",
    source: "wellfound",
    status: "SAVED",
    url: "https://wellfound.com/jobs",
    deadline: "2026-06-20",
    savedAt: "2026-06-19",
  },
  {
    id: "j8",
    title: "Frontend Engineer, Design Systems",
    company: "Discord",
    logoSlug: "discord",
    location: "San Francisco, CA",
    source: "greenhouse",
    status: "INTERVIEWING",
    url: "https://discord.com/careers",
    deadline: "2026-07-01",
    savedAt: "2026-06-08",
    salary: "$160k – $200k",
  },
  {
    id: "j9",
    title: "Machine Learning Engineer",
    company: "Anthropic",
    logoSlug: "anthropic",
    location: "Remote · US",
    source: "lever",
    status: "SAVED",
    url: "https://anthropic.com/careers",
    deadline: "2026-07-10",
    savedAt: "2026-06-16",
    salary: "$220k – $280k",
  },
  {
    id: "j10",
    title: "Growth Marketing Manager",
    company: "Workday",
    logoSlug: "workday",
    location: "Pleasanton, CA",
    source: "workday",
    status: "REJECTED",
    url: "https://workday.com/careers",
    deadline: null,
    savedAt: "2026-05-29",
  },
  {
    id: "j11",
    title: "iOS Engineer",
    company: "Notion",
    logoSlug: "notion",
    location: "Remote",
    source: "linkedin",
    status: "SAVED",
    url: "https://notion.so/careers",
    deadline: "2026-06-23",
    savedAt: "2026-06-15",
  },
  {
    id: "j12",
    title: "Data Scientist, Product",
    company: "Indeed",
    logoSlug: "indeed",
    location: "Austin, TX",
    source: "indeed",
    status: "APPLIED",
    url: "https://indeed.com/careers",
    deadline: "2026-06-30",
    savedAt: "2026-06-11",
    salary: "$140k – $175k",
  },
]
