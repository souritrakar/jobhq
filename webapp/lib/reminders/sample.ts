// Placeholder reminders used as a fallback for the dashboard's Reminders page. Real reminders
// are now persisted and fetched via `listReminders(userId)`; this sample data is kept for demos
// and tests, and matches the live `Reminder` shape exactly so the feed renders identically.

import type { Reminder } from "@/lib/reminders/types"

// Build timestamps relative to "now" so the Today / Yesterday / This week / Earlier grouping
// always demonstrates correctly, whenever this happens to be viewed.
const HOUR = 3_600_000
const DAY = 86_400_000
const now = Date.now()
const ago = (ms: number) => new Date(now - ms).toISOString()

export function sampleReminders(): Reminder[] {
  return [
    {
      id: "r1",
      title: "Application for Senior Product Designer closes tomorrow",
      type: "system",
      createdAt: ago(2 * HOUR),
      done: false,
      job: { id: "j1", company: "Linear", title: "Senior Product Designer" },
    },
    {
      id: "r2",
      title: "Follow up with the recruiter at Ramp",
      type: "user",
      createdAt: ago(5 * HOUR),
      done: false,
      job: { id: "j2", company: "Ramp", title: "Product Engineer" },
    },
    {
      id: "r3",
      title: "Prep questions for tomorrow's screening call",
      type: "user",
      createdAt: ago(9 * HOUR),
      done: true,
    },
    {
      id: "r4",
      title: "3 saved postings are closing this week",
      type: "system",
      createdAt: ago(DAY + 3 * HOUR),
      done: false,
    },
    {
      id: "r5",
      title: "Send the take-home assignment back to Notion",
      type: "user",
      createdAt: ago(DAY + 6 * HOUR),
      done: false,
      job: { id: "j5", company: "Notion", title: "Frontend Engineer" },
    },
    {
      id: "r6",
      title: "You haven't applied to anything in 4 days",
      type: "system",
      createdAt: ago(3 * DAY),
      done: false,
    },
    {
      id: "r7",
      title: "Update your resume before applying to Stripe",
      type: "user",
      createdAt: ago(4 * DAY),
      done: true,
      job: { id: "j7", company: "Stripe", title: "Design Engineer" },
    },
    {
      id: "r8",
      title: "Interview with Vercel was 2 weeks ago — send a thank-you note",
      type: "system",
      createdAt: ago(12 * DAY),
      done: false,
      job: { id: "j8", company: "Vercel", title: "Staff Engineer" },
    },
  ]
}
