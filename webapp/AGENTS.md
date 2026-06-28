<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Backend

This web app also hosts the backend API (Route Handlers under `app/api/`), shared by
the Chrome extension and the web app. **Read [`docs/BACKEND.md`](docs/BACKEND.md)
before adding or changing any API, database model, or auth code** — it defines the
layering (route → validation → service → db), the response envelope, user scoping,
and the temporary auth seam.

Key facts that differ from defaults:
- **Prisma 7**: connection URLs are NOT in `schema.prisma` — they live in
  `prisma.config.ts`, and the client uses the Neon driver adapter (`lib/db.ts`).
- **Auth:** the webapp uses **Neon Auth** (Better Auth) — see [`docs/AUTH.md`](docs/AUTH.md).
  The seam is still `lib/auth/current-user.ts` (now async: `getServerUserId`/`getUserId` are
  awaited). API routes also honor a **dev-only** `x-user-id`/`DEV_USER_ID` fallback for the
  extension (never in production; not secure).
- All DB access goes through `lib/server/*`, always scoped by `userId`. Never call
  Prisma from a route handler.

# Fallow

Fallow is installed locally for codebase analysis. Use `npm run fallow` for a full
analysis, `npm run fallow:audit -- --base <ref>` before PR-style changes, and
`npm run fallow:mcp` or `npm run fallow:lsp` when an agent/editor needs those
entrypoints. Shared config lives in `.fallowrc.json`; local cache/output under
`.fallow/` is intentionally ignored.
