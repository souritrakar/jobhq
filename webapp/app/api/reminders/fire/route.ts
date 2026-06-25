import { verifySignatureAppRouter } from "@upstash/qstash/nextjs"

import { fireReminder } from "@/lib/server/reminder-delivery"

// QStash calls this at a reminder's due time with { reminderId }. The signature wrapper rejects
// anything not signed by QStash (uses QSTASH_CURRENT/NEXT_SIGNING_KEY from env). NOT wrapped in
// withRoute — it's a machine webhook, not a CORS API.
async function handler(req: Request) {
  const { reminderId } = (await req.json()) as { reminderId?: string }
  if (!reminderId) return Response.json({ error: "reminderId required" }, { status: 400 })
  const res = await fireReminder(reminderId)
  return Response.json({ ok: true, ...res })
}

export const POST = verifySignatureAppRouter(handler)
