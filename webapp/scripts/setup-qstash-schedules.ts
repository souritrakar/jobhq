import { Client } from "@upstash/qstash"

import { env } from "@/lib/env"

/**
 * One-time, idempotent-ish registration of the daily "needs attention" digest cron. Run once per
 * environment AFTER APP_URL is publicly reachable by QStash:
 *
 *   npm run qstash:setup
 *
 * To re-point it at a new APP_URL, delete the old schedule in the Upstash console first (this just
 * creates a new one). The digest worker lives at /api/cron/reminders-digest and is QStash-signed.
 */
async function main() {
  if (!env.QSTASH_TOKEN) throw new Error("QSTASH_TOKEN is required")
  const client = new Client({ token: env.QSTASH_TOKEN })
  const destination = `${env.APP_URL}/api/cron/reminders-digest`
  const res = await client.schedules.create({ destination, cron: "0 8 * * *" }) // daily 08:00 UTC
  console.log("Created digest schedule:", res.scheduleId, "->", destination)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
