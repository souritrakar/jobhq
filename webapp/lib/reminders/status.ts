import type { Reminder } from "./types"

/**
 * Shared "is this reminder resolved?" logic, so the global feed, the per-job card, and the sidebar
 * badge all agree on what done means.
 *
 * A reminder is a to-do: the ONLY thing that closes it is the user manually ticking it off (`done`).
 * `deliveredAt` records that the worker fired it (email + in-app + extension notification went out),
 * but being *reminded* is not the same as having *handled* the thing — so it deliberately does NOT
 * resolve the reminder. A fired-but-unticked reminder stays open and overdue, exactly like any other
 * to-do you haven't done yet. `deliveredAt` is still useful as informational context elsewhere (e.g.
 * the interview control's "We reminded you · <when>"), just not as a completion signal here.
 */

type ReminderStatusFields = Pick<Reminder, "done">

/** Resolved: the user manually ticked it off. Drives strike-through + the filled checkbox. */
export function isComplete(r: ReminderStatusFields): boolean {
  return r.done
}

/** Still a live to-do — not yet ticked off. What the sidebar's red badge and overdue counts use. */
export function isOpen(r: ReminderStatusFields): boolean {
  return !r.done
}
