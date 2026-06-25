import "dotenv/config"
import { defineConfig } from "prisma/config"

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Connection URLs were removed from schema.prisma in v7 and live here instead.
 * The CLI (migrate / db push / studio) uses `datasource.url` — we point it at the
 * DIRECT (unpooled) Neon connection, which is what migrations require. Falls back
 * to DATABASE_URL if DIRECT_URL isn't set.
 *
 * Runtime connections are configured separately via the Neon driver adapter in
 * lib/db.ts (using the POOLED DATABASE_URL).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Prefer the unpooled DIRECT_URL for migrations; fall back to DATABASE_URL.
    // Read from process.env (not prisma's strict `env()`) so a missing DIRECT_URL
    // falls back gracefully instead of throwing.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
})
