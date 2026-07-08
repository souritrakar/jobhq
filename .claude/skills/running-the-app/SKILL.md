---
name: running-the-app
description: Use when asked to run, start, launch, or smoke-test the jobtracker webapp locally — covers the Next.js webapp (:3100) and the voxglide voice proxy (:3200), both required for the extension and voice-typing features.
---

# Running the jobtracker webapp locally

Two servers make up "the app". They're independent processes; start whichever the task needs, or both.

## Quick reference

| Server | Dir | Command | Port | Needed for |
|---|---|---|---|---|
| webapp | `webapp/` | `npm run dev` | 3100 | dashboard, API routes (extension targets this) |
| voxglide proxy | `voxglide-server/` | `npm run dev` | 3200 | voice-typing playground + speech-to-fill in dashboard |

Both scripts run in watch mode. Both need `.env` files already in place (both exist in this repo — don't recreate them).

## Start both (background)

```bash
# from repo root — use absolute paths, don't `cd` if it pollutes shell state
( cd webapp && npm run dev ) &            # or Bash tool with run_in_background: true
( cd voxglide-server && npm run dev ) &
```

The webapp's `predev` hook copies `../design-system/tokens.css` and `theme.css` into `webapp/design-system/`. This is expected — don't remove it.

## Verify

```bash
# webapp — should return 200
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3100/

# voxglide — WebSocket, so hit the admin page over HTTP
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3200/admin
```

Expected ready-lines in logs:
- webapp: `▲ Next.js 16.2.9 (Turbopack)` then `✓ Ready in <n>ms`
- voxglide: `[voxglide] Listening on ws://0.0.0.0:3200`

## Ports in use

If either port is already bound, find and kill the offender before restarting:

```bash
ss -ltnp | grep -E ':3100|:3200'    # or: lsof -i :3100
```

Don't change the ports. `3100` is baked into the extension's backend target; `3200` is what the voxglide React SDK connects to.

## Which server does what

- **webapp** — Next.js 16 App Router with Turbopack. Hosts the dashboard UI *and* the shared backend API (`app/api/*`) used by the Chrome extension. Auth: Neon Auth (Better Auth) — see `webapp/docs/AUTH.md`. Prisma 7 with the Neon driver adapter — connection URLs live in `prisma.config.ts`, not `schema.prisma`.
- **voxglide-server** — vendored WebSocket proxy that holds the LLM key and serves the voice SDK bundle. Not on npm; runs from `voxglide-server/server/index.ts` via `tsx watch`. Provider defaults to Anthropic Claude Sonnet.

## Common tasks

- **Test extension → backend flow**: webapp only.
- **Test voice-typing / speech-to-fill**: both. Extension/webapp calls voxglide over the WebSocket at 3200.
- **DB inspection**: `cd webapp && npm run db:studio` (separate process; opens Prisma Studio).
- **Type-check without running**: `cd webapp && npm run typecheck`.

## Gotchas

- Turbopack HMR is fast but occasionally serves a stale `prisma generate` output after schema changes. If routes 500 with unknown-field errors, restart the webapp.
- The webapp's `postinstall` runs `prisma generate` — if you nuke `node_modules`, the first `npm install` will regenerate the client.
- Voxglide reads its keys from `voxglide-server/.env` via `--env-file`. Missing keys → the server starts but sessions fail on first message; check `[voxglide] Provider:` line in logs.
- Don't run `next start` for local dev — it needs a prior `next build`. Always `npm run dev`.
