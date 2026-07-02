import { z } from "zod"

/**
 * Input validation for the INDEXED extraction routes (POST /api/extract/indexed +
 * /api/extract-application/indexed). The extension sends the page as numbered typed blocks
 * plus the harvested form fields; bounds mirror the capture-side caps (block text ≤ 2000
 * chars + a little marker slack; harvest MAX_FIELDS = 200; MAX_OPTIONS = 60).
 */

export const capturedBlockSchema = z.object({
  i: z.number().int().min(0),
  kind: z.enum(["heading", "para", "li", "row", "field"]),
  text: z.string().min(1).max(2400),
})

export const harvestedFieldSchema = z.object({
  id: z.string().min(1).max(24),
  label: z.string().min(1).max(400),
  kind: z.enum([
    "text", "textarea", "select", "radio", "checkbox", "combobox", "contenteditable", "file",
  ]),
  // Caps mirror the proven tiered-path schema (extract-tiered.ts) — permissive enough that a
  // page with long option labels can't 400-reject the whole capture.
  inputType: z.string().max(40).optional(),
  options: z.array(z.string().min(1).max(2_000)).max(100).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(400).optional(),
})

export const indexedExtractInputSchema = z.object({
  blocks: z.array(capturedBlockSchema).min(1).max(4000),
  fields: z.array(harvestedFieldSchema).max(200).default([]),
  // document.title — the details prompt's fallback source for a title/company that isn't
  // restated verbatim in the visible body; also part of the containment-check haystack.
  titleHint: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(255).optional(),
  url: z.string().trim().max(2000).optional(),
})

export type IndexedExtractInput = z.infer<typeof indexedExtractInputSchema>
