# voxglide-server (vendored)

A vendored copy of the [voxglide](https://github.com/billiax/voxglide) proxy. It is a thin
WebSocket server that:

- holds the LLM API key (it never reaches the browser),
- relays speech-transcript text to the LLM and streams back form-filling tool calls,
- serves the SDK bundle to the browser at `/sdk/voice-sdk.iife.js`,
- exposes an admin dashboard at `/admin`.

The browser SDK is loaded **from this server at runtime** by `@voxglide/react`, so this
server must be running for the `/voice-playground` page to work.

## Layout

```
voxglide-server/
  server/    upstream proxy source (unmodified TypeScript, run with tsx)
  dist/      prebuilt SDK bundle (from the npm `voxglide` package) — served at /sdk/
  examples/  upstream static examples (served at /sdk/functions/)
```

## Setup

```bash
cd voxglide-server
npm install
cp .env.example .env      # then put your real ANTHROPIC_API_KEY in .env
npm run dev               # http://localhost:3200  (tsx watch + reload)
```

`npm run dev` reads `.env` via Node's `--env-file` (requires Node ≥ 20.6; you have 20.20).

> **Port 3200, not 3100.** The webapp/backend runs on **3100**, and the Chrome extension is
> hard-wired to `http://localhost:3100` (`API_BASE`, dashboard URL, `host_permissions`). The
> proxy stays on **3200** so it never collides with the extension. `.env.example` sets this.

### Config (`.env`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `LLM_PROVIDER` | `anthropic` (what we use) | auto-detected from key |
| `ANTHROPIC_API_KEY` | Claude key for the proxy | — (required) |
| `LLM_MODEL` | model override | `claude-sonnet-4-20250514` |
| `PORT` | server port | `3200` (set in `.env.example`) |
| `ALLOWED_ORIGINS` | CORS allow-list | `*` |

> The upstream default model is `claude-sonnet-4-20250514`. To use a newer Sonnet, set
> `LLM_MODEL` in `.env`.

## Verify it's up

```bash
curl http://localhost:3200/health                 # {"status":"ok",...}
curl -I http://localhost:3200/sdk/voice-sdk.iife.js  # 200
```

## Notes

- This is vendored (not an npm dep) because the proxy is **not published to npm** — only the
  browser SDK is. `dist/` here is the published SDK bundle, kept beside `server/` because
  the server serves `/sdk/` from `../dist`.
- `server/` is upstream code, kept unmodified for easy updates. To update: re-clone
  voxglide, copy its `server/` and `examples/`, and refresh `dist/` from `npm pack voxglide`.
