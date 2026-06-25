# Voice Typing Playground — Design Spec

**Date:** 2026-06-23
**Status:** Approved, implementing
**Goal:** Add Wispr-Flow-style voice typing so users can speak to fill long application
forms / capture voice notes, with the transcript auto-organized into fields. This spec
covers a **test playground** to validate the chosen library (voxglide) before wiring it
into the real product.

## Why voxglide

Picked over the Wispr Flow API (simpler usage for us). voxglide is an embeddable voice AI
SDK: the browser captures speech via the Web Speech API, sends **text** over a WebSocket to
a **server proxy** that holds the LLM key, and the LLM returns tool calls that auto-fill
form fields. It is more than dictation — it maps a spoken ramble onto specific fields,
which matches the "rabble your thoughts → auto-transcribe & organize" goal.

- npm: `@voxglide/react` (React wrapper, v1.1.2) + `voxglide` (SDK, for TS types)
- Server proxy: lives only in the GitHub repo `server/` (not on npm) → must be vendored.
- LLM provider: **Anthropic / Claude** (`LLM_PROVIDER=anthropic`, default model
  `claude-sonnet-4-20250514`).

## Architecture

```
webapp /voice-playground (Next.js, React 19)        voxglide-server (:3200)
──────────────────────────────────────────         ──────────────────────────
<VoxGlideProvider serverUrl=ws://localhost:3200>    WS proxy + serves SDK at /sdk/
  → SDK floating mic (Shadow DOM) + auto-fill        receives transcript text
  Web Speech API: mic → text  ──────WS──────────→    calls Claude w/ page context
  fills <input>/<textarea>     ←─────WS──────────    returns fill-field tool calls
  useVoxGlideEvent('transcript') live panel          holds ANTHROPIC_API_KEY
```

Two processes run in dev: the Next.js webapp (`:3100`, the port the Chrome extension targets) and the voxglide proxy (`:3200`).

## Components

1. **`jobtracker/voxglide-server/`** — vendored copy of the upstream `server/` folder
   (MIT). Run with `ANTHROPIC_API_KEY` + `LLM_PROVIDER=anthropic`. Serves WS + SDK bundle
   on `:3200`. Own `package.json` / `node_modules`. `.env.example` documents the key.
2. **webapp deps** — add `@voxglide/react`; add `voxglide` as a dev dep (types only).
3. **`webapp/app/voice-playground/page.tsx`** (`'use client'`):
   - A realistic job-application form: structured fields (full name, role, company) **plus**
     a long "Why do you want this role?" textarea and a freeform **Notes / voice memo**
     textarea — exercises both multi-field organize and single-field ramble.
   - Wrapped in `<VoxGlideProvider serverUrl="ws://localhost:3200" debug>` → floating mic +
     auto-fill.
   - A side panel via `useVoxGlide()` / `useVoxGlideEvent('transcript')` showing connection
     state + live transcript.
   - A **"Save to tracker"** button that reads current field values (even if partial) and
     logs them — demonstrating the save-midway behavior. Persistence is a stub for now.

## Data flow

Mic → Web Speech API (browser) → text over WS → proxy → Claude → tool calls → SDK fills
DOM fields → React state updates → "Save to tracker" snapshots whatever is present.

## Error handling

- Provider/wrapper surfaces `loadError` (SDK failed to load from proxy) and `state.error`
  (connection/runtime) — both shown in the side panel.
- Mic permission denied / no Web Speech API → SDK falls back to text input.
- If the proxy is down, the page renders with a clear "proxy not connected" indicator
  rather than crashing.

## Testing / verification

- `npm run typecheck` and `npm run build` pass in webapp.
- Proxy starts on Node 20 with the Anthropic provider (Gemini SDK unused). If a transitive
  dep hard-requires Node ≥22, document the requirement / lazy-load only Anthropic.
- Manual smoke test: start both, open `/voice-playground`, click mic, speak, confirm a
  field fills and transcript appears; click Save and confirm the (partial) snapshot logs.

## Out of scope (YAGNI)

- Wiring into the real MV3 extension (the upstream repo has a content-bridge example to
  reuse later).
- Real DB persistence of voice notes / answers.
- Provider choice UI and privacy hardening (Chrome Web Speech sends audio to Google).

## Notes / risks

- Node is v20.20.2; voxglide declares ≥22. Proceed on 20, verify empirically.
- The repo is not actually git-initialized (empty `.git`); spec is not committed.
