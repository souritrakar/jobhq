// Pure builders for notification title/body, shared by the email + in-app channels so the wording
// stays consistent. House style: no em dashes in user-facing strings.

export function reminderNotificationCopy(input: { title: string; company?: string | null }): {
  title: string
  body: string
} {
  const title = input.title
  const body = input.company
    ? `Reminder for ${input.company}: ${input.title}`
    : `Reminder: ${input.title}`
  return { title, body }
}

export function digestCopy(input: {
  count: number
  sample: { title: string; company: string }[]
}): { title: string; body: string } {
  const noun = input.count === 1 ? "job" : "jobs"
  const title = `You have ${input.count} ${noun} that need attention`
  const lines = input.sample.map((j) => `• ${j.title} at ${j.company}`).join("\n")
  const more =
    input.count > input.sample.length ? `\nand ${input.count - input.sample.length} more.` : ""
  const body = `These saved roles have been sitting untouched:\n${lines}${more}`
  return { title, body }
}
