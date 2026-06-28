import { z } from "zod"

/**
 * Input validation for the TIERED (non-LLM) extraction routes (POST /api/extract/tiered and
 * /api/extract-application/tiered). These are the structured-data + embeddings alternative to the
 * LLM routes — the extension sends the page's machine-readable signals (job details) or its harvested
 * form controls (questions) instead of raw page markdown. Bounds below just cap a pathological page,
 * the same way lib/validations/autofill.ts does for the autofill harvest.
 */

/* ----- Job details ----- */

const keyValueSegment = z.object({
  key: z.string().max(300),
  value: z.string().max(5_000),
})

const structuredSignals = z.object({
  // Raw <script type=ld+json> bodies, parsed server-side. Bounded so a giant blob can't blow up the body.
  jsonLd: z.array(z.string().max(20_000)).max(15).default([]),
  // og:/twitter:/name meta tags as a flat map.
  meta: z.record(z.string(), z.string().max(5_000)).default({}),
  // dl/dt-dd, table rows, microdata, and label/value clusters.
  segments: z.array(keyValueSegment).max(400).default([]),
  h1: z.string().max(2_000).optional(),
  titleHint: z.string().max(2_000).optional(),
  // The cleaned page markdown — kept for parity/fallback only; the tiered path doesn't read it.
  mainText: z.string().max(60_000).optional(),
})

export const tieredExtractInputSchema = z.object({
  signals: structuredSignals,
  source: z.string().trim().max(255).optional(),
  url: z.string().trim().max(2_000).optional(),
})

export type TieredExtractInput = z.infer<typeof tieredExtractInputSchema>

/* ----- Application questions ----- */

// Questions-oriented harvest: like the autofill DomField, but carries the native input type and the
// `file` kind (the LLM extracts resume-upload questions, so the tiered path must see file inputs too).
const harvestedQuestionField = z.object({
  id: z.string().min(1).max(120),
  label: z.string().max(400),
  kind: z.enum([
    "text",
    "textarea",
    "select",
    "radio",
    "checkbox",
    "contenteditable",
    "combobox",
    "file",
  ]),
  inputType: z.string().max(40).optional(),
  options: z.array(z.string().max(2_000)).max(100).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(400).optional(),
  helpText: z.string().max(400).optional(),
})

export const tieredApplicationExtractInputSchema = z.object({
  // May be empty: a page with no form yields { questions: [] } (the "no application form" state).
  fields: z.array(harvestedQuestionField).max(400).default([]),
  source: z.string().trim().max(255).optional(),
  url: z.string().trim().max(2_000).optional(),
})

export type TieredApplicationExtractInput = z.infer<typeof tieredApplicationExtractInputSchema>
