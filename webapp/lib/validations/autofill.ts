import { z } from "zod"

/**
 * Input validation for the extension's one-click Autofill match
 * (POST /api/jobs/:id/application/autofill-match).
 *
 * The extension harvests the page's fillable input fields (label + kind + any options) and posts them
 * here; the server matches each SAVED application question to its field and returns what to fill. We
 * send ONLY labels/kinds/option-labels — never page HTML or values — so this stays token-light and the
 * bounds below just cap a pathological page.
 */

// What the harvester reports a control as. Native text-ish inputs (number/email/url/tel/date) all
// collapse to "text" — they fill identically (set value + dispatch events). `file` is out of scope and
// is never harvested.
const fieldKind = z.enum(["text", "textarea", "select", "radio", "checkbox", "contenteditable"])

const domOption = z.object({
  value: z.string().max(2_000),
  label: z.string().max(2_000),
})

const domField = z.object({
  // Ephemeral per-harvest id the extension uses to write the value back to the right element.
  id: z.string().min(1).max(120),
  label: z.string().max(400),
  kind: fieldKind,
  options: z.array(domOption).max(100).optional(),
  required: z.boolean().optional(),
})

export const autofillMatchSchema = z.object({
  fields: z.array(domField).min(1).max(300),
})

export type DomFieldInput = z.infer<typeof domField>
export type AutofillMatchInput = z.infer<typeof autofillMatchSchema>
