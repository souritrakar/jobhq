/**
 * Seed a dev user and a couple of sample jobs so the API can be tested immediately.
 *
 * Run with: npm run db:seed
 * Then copy the printed user id into webapp/.env as DEV_USER_ID so requests without
 * auth resolve to this user (see lib/auth/current-user.ts).
 */
import "dotenv/config"
import { neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@prisma/client"
import ws from "ws"

// Prisma 7 needs a driver adapter. Use the direct connection for the seed.
neonConfig.webSocketConstructor = ws
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
const adapter = new PrismaNeon({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "dev@jobtracker.local" },
    update: {},
    create: { email: "dev@jobtracker.local", name: "Dev User" },
  })

  // Idempotent: clear this user's jobs so re-running doesn't pile up duplicates.
  await prisma.job.deleteMany({ where: { userId: user.id } })

  await prisma.job.createMany({
    data: [
      {
        userId: user.id,
        title: "Frontend Engineer",
        company: "Acme Corp",
        url: "https://example.com/jobs/frontend",
        source: "manual",
        status: "SAVED",
      },
      {
        userId: user.id,
        title: "Backend Engineer",
        company: "Globex",
        source: "linkedin",
        status: "APPLIED",
      },
    ],
  })

  console.log("\n✅ Seed complete.")
  console.log(`   DEV_USER_ID=${user.id}`)
  console.log("   Add that line to webapp/.env to test the API without auth.\n")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
