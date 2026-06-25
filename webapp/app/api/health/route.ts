import { prisma } from "@/lib/db"
import { ok, preflight, withRoute } from "@/lib/api/route"

// Liveness + DB connectivity check. Useful for deploy health checks and for
// confirming the Neon connection works before testing the rest of the API.
export const GET = withRoute(async () => {
  await prisma.$queryRaw`SELECT 1`
  return ok({ status: "ok", db: "connected" })
})

export const OPTIONS = preflight
