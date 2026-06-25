This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Voice Typing Playground

A sandbox for the voxglide voice-typing feature (speak → transcribe → auto-fill form
fields, Wispr-Flow-style). Route: **`/voice-playground`**.

It needs **two processes**: this Next.js app **and** the voxglide proxy (it holds the
Claude key and serves the browser SDK). The proxy lives in `../voxglide-server`.

```bash
# Terminal 1 — proxy (holds ANTHROPIC_API_KEY, serves SDK + WebSocket on :3200)
cd ../voxglide-server
npm install
cp .env.example .env          # add your real ANTHROPIC_API_KEY (PORT=3200 is preset)
npm run dev

# Terminal 2 — this app on :3100 (the port the Chrome extension targets)
npm run dev -- -p 3100
```

Then open <http://localhost:3100/voice-playground>, click **Start voice** (or the floating
mic), speak your answers, and watch the fields fill. **Save to tracker** snapshots whatever
is in the form — including a partial answer.

**Config**

- The page connects to the proxy at `ws://localhost:3200` by default. Override with
  `NEXT_PUBLIC_VOXGLIDE_URL` if you run the proxy elsewhere.
- ⚠️ **Ports:** this app runs on **3100** because the Chrome extension is hard-wired to
  `http://localhost:3100` (`API_BASE`, dashboard, `host_permissions`). The proxy therefore
  stays on **3200** to avoid colliding with it. Don't put the proxy on 3100.

**Privacy note:** Chrome's Web Speech API sends microphone audio to Google for
transcription; the resulting text then goes to Claude via the proxy. Fine for a playground —
revisit before shipping to production.

See [`docs/superpowers/specs/`](docs/superpowers/specs/) for the design spec and
[`../voxglide-server/README.md`](../voxglide-server/README.md) for proxy details.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
