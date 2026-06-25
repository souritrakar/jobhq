import { verifySignatureAppRouter } from "@upstash/qstash/nextjs"

import { runDigest } from "@/lib/server/system-reminders"

// QStash calls this on a daily cron. Runs the digest sweep at the current time. NOT wrapped in
// withRoute — it's a signed machine webhook, not a CORS API.
async function handler() {
  const res = await runDigest(new Date())
  return Response.json({ ok: true, ...res })
}

export const POST = verifySignatureAppRouter(handler)
