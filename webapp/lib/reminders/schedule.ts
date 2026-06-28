// The "when is this due?" logic shared by every reminder composer — the per-job popover and the
// standalone feed composer. Kept framework-free (pure functions + constants) so both the popover
// and the feed import the exact same quick-pick chips and date-resolution rules.

// Quick-pick chips. Fixed chips map to a whole-day offset from today; "nextweek" resolves to a
// random weekday in the *following* calendar week; "custom" reveals a date input ("Pick date").
export const CHIPS = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "in2", label: "In 2 days" },
  { key: "nextweek", label: "Next week" },
  { key: "custom", label: "Pick date" },
] as const

export type ChipKey = (typeof CHIPS)[number]["key"]

// Whole-day offsets for the fixed chips. "nextweek"/"custom" are resolved specially below.
const DAY_OFFSETS: Partial<Record<ChipKey, number>> = { today: 0, tomorrow: 1, in2: 2 }

function startOfDayPlus(days: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

// Monday-anchored start of the week containing `d`, at local midnight.
function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const dow = (r.getDay() + 6) % 7 // 0 = Monday … 6 = Sunday
  r.setDate(r.getDate() - dow)
  return r
}

// "Next week" → a random *weekday* (Mon–Fri) in the calendar week after the current one. Anchoring
// to next Monday means it's never this week and never a weekend: on a weekend "today" already points
// at the upcoming week (not the one that's ending), and capping the random offset at Friday keeps it
// from landing on — or waiting until — the following Saturday/Sunday.
function nextWeekWeekday(): Date {
  const day = startOfWeek(new Date())
  day.setDate(day.getDate() + 7 + Math.floor(Math.random() * 5)) // next Mon … next Fri
  return day
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// When the user picks a day but no time, we still want a concrete moment to fire at. Pick a random
// time so reminders don't all stack at one hour: a waking-hours slot (9am–9pm) on a future day, or —
// for today — at least 2–3 hours out (then a random slack later in the day) so it never fires now.
function randomDueTime(base: Date): Date {
  const now = new Date()
  if (sameDay(base, now)) {
    const minLeadMs = (2 + Math.random()) * 3_600_000 // 2–3 hours from now
    const earliest = now.getTime() + minLeadMs
    const endOfDay = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      23,
      30,
    ).getTime()
    // Late at night the 2–3h lead naturally spills into the small hours — that's the only sane
    // reading of "at least 2–3 hours later", so use it directly rather than forcing it back to today.
    const t = earliest >= endOfDay ? earliest : earliest + Math.random() * (endOfDay - earliest)
    return new Date(t)
  }
  const d = new Date(base)
  d.setHours(randomInt(9, 20), randomInt(0, 59), 0, 0)
  return d
}

// Resolve the selected chip + optional custom date + optional time into a due timestamp. An explicit
// time is honored as-is (and marked `hasTime`); otherwise we auto-assign a random time on the day
// (see randomDueTime) but leave `hasTime` false, so the UI shows the date and delivery still fires
// at the chosen moment.
export function buildDue(
  chip: ChipKey | null,
  customDate: string,
  time: string,
): { dueAt?: string; hasTime?: boolean } {
  let base: Date | null = null
  if (chip === "nextweek") {
    base = nextWeekWeekday()
  } else if (chip === "custom") {
    if (customDate) {
      const [y, m, d] = customDate.split("-").map(Number)
      base = new Date(y, m - 1, d)
    }
  } else if (chip) {
    const offset = DAY_OFFSETS[chip]
    if (offset !== undefined) base = startOfDayPlus(offset)
  }
  if (!base) return {} // no due date — allowed
  if (time) {
    const [h, min] = time.split(":").map(Number)
    base.setHours(h, min, 0, 0)
    return { dueAt: base.toISOString(), hasTime: true }
  }
  return { dueAt: randomDueTime(base).toISOString(), hasTime: false }
}
