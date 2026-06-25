/**
 * One-off backfill: give every existing job a randomized pipeline status so the
 * Kanban board has something to show. The `status` column already exists (JobStatus
 * enum, default SAVED) — historically most rows sat at SAVED, so this spreads them
 * across the active pipeline stages.
 *
 * Run with: npm run db:randomize-status
 *
 * Idempotent-ish: re-running simply re-randomizes. Only the five *board* statuses are
 * used (ARCHIVED is a terminal "removed" state and isn't shown on the board).
 */
import "dotenv/config"
import { neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient, type JobStatus } from "@prisma/client"
import ws from "ws"

// Prisma 7 needs a driver adapter. Use the direct connection for a script.
neonConfig.webSocketConstructor = ws
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
const adapter = new PrismaNeon({ connectionString })
const prisma = new PrismaClient({ adapter })

const STATUSES: JobStatus[] = [
  "SAVED",
  "APPLIED",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
]

function randomStatus(): JobStatus {
  return STATUSES[Math.floor(Math.random() * STATUSES.length)]
}

async function main() {
  const jobs = await prisma.job.findMany({ select: { id: true } })
  if (jobs.length === 0) {
    console.log("No jobs to update.")
    return
  }

  // Per-row update so each job gets an independent random status.
  const counts: Record<string, number> = {}
  await prisma.$transaction(
    jobs.map((job) => {
      const status = randomStatus()
      counts[status] = (counts[status] ?? 0) + 1
      return prisma.job.update({ where: { id: job.id }, data: { status } })
    }),
  )

  console.log(`\n✅ Randomized status for ${jobs.length} job(s).`)
  for (const status of STATUSES) {
    console.log(`   ${status.padEnd(13)} ${counts[status] ?? 0}`)
  }
  console.log("")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
