// The client-facing shape of a reminder, shared by the global Reminders feed, the per-job
// rail card, and the browser mutation helpers. The server serializes Prisma rows into this
// shape (see lib/server/reminders.ts → toClientReminder); placeholder/sample data matches it
// too, so the feed renders identically whether the data is real or stubbed.

export type ReminderType =
  | "system" // we generated it — a deadline we spotted, a follow-up we inferred
  | "user" // you set it yourself

export type Reminder = {
  id: string
  title: string
  type: ReminderType
  /** ISO timestamp of when the reminder was created — drives the feed's time grouping. */
  createdAt: string
  done: boolean
  /** ISO timestamp of when the reminder is due. Absent for reminders with no due date. */
  dueAt?: string
  /** Whether `dueAt` carries a meaningful time-of-day (vs. a date-only reminder). */
  hasTime?: boolean
  /** Optional posting this reminder is about. Absent for general/standalone reminders. */
  job?: { id: string; company: string; title: string }
}
