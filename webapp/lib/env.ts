import { z } from "zod"

/**
 * Validated, typed access to environment variables.
 *
 * Import `env` instead of reading `process.env` directly so that a missing or
 * malformed variable fails loudly at startup rather than as a confusing runtime
 * error deep in a request. Add new server env vars to the schema below.
 */
const envSchema = z.object({
  // Neon Postgres. Pooled connection for runtime, direct connection for migrations.
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Comma-separated list of origins allowed to call the API (the web app and the
  // extension). Extension origins look like `chrome-extension://<id>`.
  ALLOWED_ORIGINS: z.string().optional(),

  // Neon Auth (Better Auth) powers the webapp's authentication (see docs/AUTH.md).
  //   NEON_AUTH_BASE_URL       — the branch's Auth URL (Console → Branch → Auth → Configuration).
  //   NEON_AUTH_COOKIE_SECRET  — >=32-char secret signing the session cookie (openssl rand -base64 32).
  // Both are server-only; the client SDK talks to the same-origin /api/auth proxy. Optional so the
  // app still boots without them (auth routes then error loudly when hit), keeping local non-auth
  // workflows runnable.
  NEON_AUTH_BASE_URL: z.string().url().optional(),
  NEON_AUTH_COOKIE_SECRET: z.string().min(32).optional(),

  // The extension's auth seam (webapp uses Neon Auth above). In non-production, API requests without
  // a Neon Auth session fall back to the spoofable `x-user-id` header or this seeded dev user so the
  // extension and curl can exercise CRUD. Never honored in production. See lib/auth/current-user.ts.
  DEV_USER_ID: z.string().optional(),

  // Groq powers job extraction (POST /api/extract + /api/extract-application). The key lives
  // here, server-side only — it must never be shipped in the extension bundle. GPT-OSS is
  // cache-eligible on Groq, and both extraction prompts put the captured page FIRST so the
  // page text is the shared cached prefix: the details call writes it, the application call
  // (same posting, same DOM) reads it at 50% off — and cached tokens don't count toward TPM.
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("openai/gpt-oss-20b"),

  // OpenRouter powers the AI cover letter (POST /api/cover-letter) — creative prose, a different
  // job from Groq's structured extraction. Server-side ONLY (never shipped to the extension/client).
  //   OPENROUTER_API_KEY        — the "sk-or-v1-…" key.
  //   COVER_LETTER_MODEL        — primary model slug (Claude Haiku 4.5).
  //   COVER_LETTER_FALLBACK_MODELS — comma-separated slugs OpenRouter falls back to, in order, if
  //     the primary is unavailable (GLM 4.7 Flash → Gemini 3.1 Flash Lite). See lib/llm/openrouter.ts.
  OPENROUTER_API_KEY: z.string().optional(),
  COVER_LETTER_MODEL: z.string().default("anthropic/claude-haiku-4.5"),
  COVER_LETTER_FALLBACK_MODELS: z
    .string()
    .default("z-ai/glm-4.7-flash,google/gemini-3.1-flash-lite"),

  // OpenRouter also powers the per-question "AI draft" on the job detail page (POST
  // /api/jobs/:id/application/draft) — short, grounded answers from the job + the user's resume.
  // A fast, cheap model fits: default Gemini 3.5 Flash, falling back to slugs we already know are
  // live so a not-yet-available primary self-heals via OpenRouter's routing. Server-side ONLY.
  //   AI_DRAFT_MODEL            — primary model slug.
  //   AI_DRAFT_FALLBACK_MODELS  — comma-separated fallbacks, in order.
  //   AI_DRAFT_MAX_TOKENS       — hard output cap (one or a few paragraphs; bounds cost + runaway).
  AI_DRAFT_MODEL: z.string().default("google/gemini-3.5-flash"),
  AI_DRAFT_FALLBACK_MODELS: z
    .string()
    .default("google/gemini-3.1-flash-lite,z-ai/glm-4.7-flash"),
  AI_DRAFT_MAX_TOKENS: z.coerce.number().int().min(128).max(4000).default(600),

  // OpenRouter ALSO powers embeddings for the extension's one-click Autofill field matcher
  // (POST /api/jobs/:id/application/autofill-match) — the only embeddings seam (lib/llm/embeddings.ts).
  // OpenAI-compatible, so the same OPENROUTER_API_KEY above is reused; no separate OpenAI account.
  //   EMBEDDINGS_MODEL — provider-namespaced slug; defaults to openai/text-embedding-3-small (1536-dim).
  EMBEDDINGS_MODEL: z.string().optional(),

  // Tuning knobs for the TIERED (non-LLM) extractor — the structured-data + embeddings alternative to
  // the Groq routes (POST /api/extract/tiered + /api/extract-application/tiered; see lib/extraction/*).
  // All have safe defaults so the feature works with no extra config; override to calibrate against
  // real pages. Reuse the autofill MIN_SCORE (0.45) for the segment-key → field match.
  //   TIERED_ENUM_MIN_SCORE      — cosine floor to snap a free-text employment/workplace value to the
  //     controlled vocab (stricter — a wrong enum is a visible error; below it we drop, never guess).
  //   TIERED_QUESTION_KEEP_FLOOR — absolute cosine floor for keeping a weak free-text form field.
  //   TIERED_NOISE_MARGIN        — how far a weak field must beat the noise space (search/login/cookie)
  //     to survive the inclusion gate.
  TIERED_ENUM_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.55),
  TIERED_QUESTION_KEEP_FLOOR: z.coerce.number().min(0).max(1).default(0.3),
  TIERED_NOISE_MARGIN: z.coerce.number().min(-1).max(1).default(0.03),

  // Firecrawl powers the in-app "save a job from a URL" import (POST /api/jobs/import):
  // ONE /v2/scrape call runs the structured extraction (Firecrawl's own LLM) plus the
  // branding/logo capture, so this path adds no Groq spend. Server-side only — it must
  // never be shipped in the extension/client bundle.
  FIRECRAWL_API_KEY: z.string().optional(),

  // Cloudflare R2 — object storage for user-uploaded documents (resumes, cover letters).
  // Neon's "split-storage" pattern: bytes live in R2, metadata in the Document table. These
  // are S3 data-plane credentials (server-side ONLY — never shipped to the client). The bucket
  // stays PRIVATE; documents are served only through the userId-scoped /api/documents/:id/raw
  // proxy, so there are no public URLs or presigned tokens to leak. When all four are present
  // the R2 provider activates (lib/server/storage/document-storage.ts); otherwise uploads use
  // the stub that fails loudly. The Cloudflare *API* token (cfat_…) is NOT needed here — it's
  // for the management API, not S3 data access.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),

  // context.dev — an ALTERNATIVE structured-extraction provider for the URL import, under
  // evaluation against Firecrawl (same schema + prompt; see lib/llm/context-dev.ts). Its
  // /v1/web/extract endpoint takes a JSON Schema + instructions and can crawl multiple pages.
  // Not wired into the live import path yet. Server-side only.
  CONTEXT_DEV_API_KEY: z.string().optional(),

  // Upstash QStash — the scheduler for reminder delivery. QSTASH_TOKEN lets the app publish
  // one-shot deliveries (per dated reminder) + the hourly digest cron; the two signing keys let
  // the worker/cron routes verify that an incoming request is genuinely from QStash. All optional
  // so the app still boots (and reminder CRUD still works) when scheduling is not configured —
  // the scheduler then no-ops (see lib/reminders/scheduler.ts).
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),

  // Resend — the email channel for reminder + digest delivery. RESEND_API_KEY is optional so the
  // app boots without it; email sends then no-op with a logged warning (see lib/email/client.ts).
  // EMAIL_FROM must be a verified sending domain in production.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("JobTracker <reminders@jobtracker.app>"),
  // TEST-MODE override: when set, EVERY outgoing email is redirected to this address regardless of
  // the real recipient. Needed while sending from Resend's shared `onboarding@resend.dev` sandbox
  // sender, which only delivers to the Resend account owner. Remove once a domain is verified in
  // Resend and EMAIL_FROM points at it (then real recipients receive their own mail). See lib/email/client.ts.
  EMAIL_OVERRIDE_TO: z.string().email().optional(),

  // Public base URL QStash calls back to (the worker + digest cron live here). In prod this is the
  // deployed origin; in local dev it must be a publicly reachable tunnel OR the Upstash QStash dev
  // server (see scripts/curl/README.md), since QStash cannot reach a bare localhost.
  APP_URL: z.string().url().default("http://localhost:3100"),
})

function loadEnv() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    throw new Error(`Invalid environment variables:\n${issues}`)
  }
  return parsed.data
}

export const env = loadEnv()
