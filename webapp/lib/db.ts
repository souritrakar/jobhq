import { neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@prisma/client"
import ws from "ws"

import { env } from "@/lib/env"

/**
 * A single shared PrismaClient backed by the Neon serverless driver adapter.
 *
 * Prisma 7 requires a driver adapter instead of a connection string in the schema.
 * We use @prisma/adapter-neon over the POOLED DATABASE_URL so serverless/Node
 * functions reuse Neon's connection pool instead of opening a new TCP connection
 * per invocation.
 *
 * The client is cached on `globalThis` in development so Next.js hot-reload doesn't
 * create a new pool on every edit. In production the module initializes once.
 */

// Neon's Pool uses WebSockets; in a Node runtime we must supply the constructor.
neonConfig.webSocketConstructor = ws

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  // PrismaNeon manages the Neon connection pool internally from this config.
  const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL })
  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
