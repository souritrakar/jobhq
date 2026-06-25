// Small date helpers for the dashboard. Relative labels are computed against the
// real current time, and accept either an ISO string or a Date (Prisma returns Dates).

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/** Whole days from today to `value` (negative = past). */
export function daysUntil(value: string | Date): number {
  const ms = startOfDay(toDate(value)) - startOfDay(new Date())
  return Math.round(ms / 86_400_000)
}

/** Human deadline urgency, e.g. "Closes today", "3d left", "Closed". */
export function deadlineLabel(value: string | Date): string {
  const d = daysUntil(value)
  if (d < 0) return "Closed"
  if (d === 0) return "Closes today"
  if (d === 1) return "1d left"
  return `${d}d left`
}

/** Relative "saved" label, e.g. "Saved today", "Saved 3d ago". */
export function savedLabel(value: string | Date): string {
  const d = -daysUntil(value)
  if (d <= 0) return "Today"
  if (d === 1) return "Yesterday"
  if (d < 30) return `${d}d ago`
  return `${Math.round(d / 30)}mo ago`
}

/** A recency bucket for grouping the home feed; ordered newest → oldest. */
export type SavedBucket = "today" | "thisWeek" | "lastWeek" | "earlier"

/** Monday-anchored start-of-week, in ms. */
function startOfWeek(d: Date): number {
  const dow = (d.getDay() + 6) % 7 // 0 = Monday … 6 = Sunday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow).getTime()
}

/**
 * Which recency group a saved timestamp falls into, relative to now. Calendar-aware so the
 * labels stay truthful: "this week" / "last week" track real Monday-anchored weeks, not a
 * rolling 7-day window. Future timestamps clamp to "today".
 */
export function savedBucket(value: string | Date): SavedBucket {
  const day = startOfDay(toDate(value))
  const today = startOfDay(new Date())
  if (day >= today) return "today"
  const weekStart = startOfWeek(new Date())
  if (day >= weekStart) return "thisWeek"
  if (day >= weekStart - 7 * 86_400_000) return "lastWeek"
  return "earlier"
}

/** Recency buckets for the reminders feed; ordered newest → oldest. */
export type CreatedBucket = "today" | "yesterday" | "thisWeek" | "earlier"

/**
 * Which recency group a created timestamp falls into, relative to now. "Yesterday" is its own
 * bucket (so it never folds into "this week"), then the remainder of the current Monday-anchored
 * week, then everything older. Future timestamps clamp to "today".
 */
export function createdBucket(value: string | Date): CreatedBucket {
  const d = daysUntil(value) // negative = past
  if (d >= 0) return "today"
  if (d === -1) return "yesterday"
  const day = startOfDay(toDate(value))
  if (day >= startOfWeek(new Date())) return "thisWeek"
  return "earlier"
}

/**
 * The created-at stamp shown on a reminder row. Today/yesterday show the clock time (the precision
 * the group header can't give); older rows show the calendar date. Kept non-redundant with the
 * group header, which already carries the coarse recency.
 */
export function createdAtLabel(value: string | Date): string {
  if (daysUntil(value) >= -1) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(toDate(value))
  }
  return formatDate(value)
}

/**
 * A reminder's due label, e.g. "Today", "Tomorrow", "In 3 days", "Jun 30", "Jun 30, 2:00 PM".
 * `hasTime` controls whether the time-of-day is appended (date-only reminders omit it). The
 * caller checks `daysUntil(value) < 0` for overdue styling — the label itself stays neutral.
 */
export function dueLabel(value: string | Date, hasTime = false): string {
  const d = daysUntil(value)
  const time = hasTime
    ? `, ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(toDate(value))}`
    : ""
  if (d === 0) return `Today${time}`
  if (d === 1) return `Tomorrow${time}`
  if (d === -1) return `Yesterday${time}`
  if (d > 1 && d < 7) return `In ${d} days${time}`
  return `${formatDate(value)}${time}`
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(toDate(value))
}

const MINUTE_MS = 60_000

/** Signed ms from now to `value` (positive = future). Uses the wall clock, not start-of-day. */
function msFromNow(value: string | Date): number {
  return toDate(value).getTime() - Date.now()
}

function clockTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(toDate(value))
}

function weekday(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(toDate(value))
}

/**
 * Is a reminder past its due moment? Time-bearing reminders compare against the wall clock (so
 * "due at 2pm" is overdue by 2:01pm); date-only reminders only fall overdue once the whole day
 * has passed (they're never "late" during their own day).
 */
export function isOverdue(value: string | Date, hasTime = false): boolean {
  return hasTime ? msFromNow(value) < 0 : daysUntil(value) < 0
}

/** Urgency buckets for the reminders feed, ordered most-urgent → least. */
export type DueBucket = "overdue" | "today" | "tomorrow" | "thisWeek" | "later" | "unscheduled"

/**
 * Which urgency bucket a reminder belongs in — the axis the feed is grouped by. Driven by the due
 * moment (not creation): overdue first, then today / tomorrow, the rest of this Monday-anchored
 * week, everything further out, and finally reminders with no due date at all.
 */
export function dueBucket(value?: string | Date | null, hasTime = false): DueBucket {
  if (value == null) return "unscheduled"
  if (isOverdue(value, hasTime)) return "overdue"
  const d = daysUntil(value)
  if (d === 0) return "today"
  if (d === 1) return "tomorrow"
  const day = startOfDay(toDate(value))
  const nextWeek = startOfWeek(new Date()) + 7 * 86_400_000
  return day < nextWeek ? "thisWeek" : "later"
}

/**
 * Human-readable due label tuned for at-a-glance "how soon?". Intraday precision when it matters
 * ("Due in 45 min", "2 hours overdue"), relative names near term ("Today, 4:00 PM", "Tomorrow",
 * "Friday"), and calendar dates further out ("Jul 8"). `hasTime` controls whether a time-of-day is
 * shown — date-only reminders stay coarse. Pairs with `dueBucket` for the urgency color.
 */
export function dueDisplay(value: string | Date, hasTime = false): string {
  const d = daysUntil(value)

  if (isOverdue(value, hasTime)) {
    if (hasTime && d === 0) {
      const mins = Math.max(1, Math.round(-msFromNow(value) / MINUTE_MS))
      if (mins < 60) return `${mins} min overdue`
      const hrs = Math.round(mins / 60)
      return `${hrs} ${hrs === 1 ? "hour" : "hours"} overdue`
    }
    const days = -d
    if (days <= 1) return hasTime ? `Yesterday, ${clockTime(value)}` : "Yesterday"
    if (days < 7) return `${days} days overdue`
    return `Overdue · ${formatDate(value)}`
  }

  if (hasTime && d === 0) {
    const mins = Math.round(msFromNow(value) / MINUTE_MS)
    return mins < 60 ? `Due in ${Math.max(1, mins)} min` : `Today, ${clockTime(value)}`
  }
  if (d === 0) return "Today"
  if (d === 1) return hasTime ? `Tomorrow, ${clockTime(value)}` : "Tomorrow"
  if (d > 1 && d < 7) return hasTime ? `${weekday(value)}, ${clockTime(value)}` : weekday(value)
  return hasTime ? `${formatDate(value)}, ${clockTime(value)}` : formatDate(value)
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

export function todayLong(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date())
}
