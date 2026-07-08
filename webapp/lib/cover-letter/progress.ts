/**
 * The wire protocol for the cover-letter pipeline (Stage 5) — shared by the server route and the
 * client so both agree on the shape. Pure, no I/O, no server-only imports (the client bundles it).
 *
 * The route streams NDJSON: one JSON object per `\n`-delimited line. Instead of raw letter tokens
 * (the old protocol), the body carries PROGRESS events while the pipeline runs, then exactly one
 * terminal event — either the finished, fully-vetted letter or a clean error:
 *
 *   {"t":"status","phase":"drafting"}
 *   {"t":"status","phase":"reviewing"}
 *   {"t":"status","phase":"polishing"}          // only when a revise pass runs
 *   {"t":"letter","text":"Dear Hiring Manager,…"}   // the final vetted artifact  (terminal)
 *   {"t":"error","code":"SAFETY","message":"…"}     // clean mid-pipeline failure   (terminal)
 *
 * Errors that occur BEFORE the stream opens (validation, input moderation, missing config) still
 * ride the normal JSON `{ error }` envelope; only failures AFTER bytes start use an `error` event,
 * since we can no longer switch the HTTP status.
 */

/** Coarse progress stages surfaced to the user as friendly status lines (see the client's map). */
export type ProgressPhase = "drafting" | "reviewing" | "polishing"

export type ProgressEvent =
  | { t: "status"; phase: ProgressPhase }
  | { t: "letter"; text: string }
  | { t: "error"; code: string; message: string }

const PHASES: readonly ProgressPhase[] = ["drafting", "reviewing", "polishing"]

/** Serialize one event as an NDJSON line (JSON + trailing newline). */
export function encodeEvent(event: ProgressEvent): string {
  return `${JSON.stringify(event)}\n`
}

/**
 * Pull every COMPLETE NDJSON line out of a running buffer, returning the parsed events plus the
 * leftover partial line (a network read can split mid-line). The caller keeps `rest` and prepends it
 * to the next chunk. Corrupt or unrecognized lines are skipped rather than throwing, so one bad line
 * never wedges the stream.
 */
export function drainEvents(buffer: string): { events: ProgressEvent[]; rest: string } {
  const events: ProgressEvent[] = []
  let rest = buffer
  let nl: number
  while ((nl = rest.indexOf("\n")) !== -1) {
    const line = rest.slice(0, nl).trim()
    rest = rest.slice(nl + 1)
    if (!line) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (isProgressEvent(parsed)) events.push(parsed)
    } catch {
      // Partial/corrupt JSON — skip; a genuinely split line will re-arrive whole via `rest`.
    }
  }
  return { events, rest }
}

/** Runtime type guard — validates a parsed value is a well-formed event before we trust it. */
export function isProgressEvent(value: unknown): value is ProgressEvent {
  if (typeof value !== "object" || value === null) return false
  const e = value as Record<string, unknown>
  switch (e.t) {
    case "status":
      return typeof e.phase === "string" && (PHASES as readonly string[]).includes(e.phase)
    case "letter":
      return typeof e.text === "string"
    case "error":
      return typeof e.code === "string" && typeof e.message === "string"
    default:
      return false
  }
}
