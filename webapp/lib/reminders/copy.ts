// Pure builders for notification title/body, shared by the email + in-app channels so the wording
// stays consistent. House style: no em dashes in user-facing strings.

// Notification copy shared by the email + in-app channels. The reminder text is the headline
// (`title`); `where` is the secondary "Role @ Company" line shown only when the reminder is tied to
// a job (both fields are required on Job, so a job-linked reminder always has it). `body` is the
// in-app subtitle, which is just `where` (the bell already shows the title above it).
export function reminderNotificationCopy(input: {
  title: string
  role?: string | null
  company?: string | null
}): {
  title: string
  where: string | null
  body: string | undefined
} {
  const title = input.title
  const where =
    input.role && input.company
      ? `${input.role} @ ${input.company}`
      : input.company || input.role || null

  return { title, where, body: where ?? undefined }
}

// `intro` is the muted lead-in shared by both channels; `body` is the flat plain-text rendering for
// the in-app bell (no per-row typography there). The email reads the structured `sample`/count
// directly for its richer card layout, so it doesn't consume `body`.
export function digestCopy(input: {
  count: number
  sample: { title: string; company: string }[]
}): { title: string; intro: string; body: string } {
  // Singular agreement: "1 job that needs", "N jobs that need".
  const noun = input.count === 1 ? "job" : "jobs"
  const verb = input.count === 1 ? "needs" : "need"
  const title = `You have ${input.count} ${noun} that ${verb} attention`
  const intro = "These saved roles have been sitting untouched"
  const lines = input.sample.map((j) => `• ${j.title} at ${j.company}`).join("\n")
  const more =
    input.count > input.sample.length ? `\nand ${input.count - input.sample.length} more.` : ""
  const body = `${intro}:\n${lines}${more}`
  return { title, intro, body }
}
