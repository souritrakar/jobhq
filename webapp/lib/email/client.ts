import { Resend } from "resend"

import { env } from "@/lib/env"

// Null when RESEND_API_KEY is unset — sends then no-op with a warning so the app works without an
// email provider configured (in-app + extension channels still deliver).
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY unset — skipping send to", input.to)
    return
  }
  // TEST-MODE: redirect every email to the override address (Resend sandbox can only reach the
  // account owner). The intended recipient is preserved in the subject so test mail stays traceable.
  const to = env.EMAIL_OVERRIDE_TO || input.to
  const subject = env.EMAIL_OVERRIDE_TO ? `${input.subject} [→ ${input.to}]` : input.subject
  try {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html: input.html,
    })
  } catch (err) {
    console.error("[email] send failed", to, err)
  }
}
