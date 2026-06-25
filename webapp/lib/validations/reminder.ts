import { z } from "zod"

/**
 * Input validation for the reminders API. Single source of truth for what the web app may send;
 * the inferred types flow into the service layer so DB writes are shape-checked.
 *
 * `dueAt` accepts the ISO string JSON carries and coerces it to a Date (same approach as
 * `job.deadline`). `hasTime` records whether the user picked a time-of-day, so the UI can render
 * "Jun 30" vs "Jun 30, 2:00 PM" without guessing.
 */
export const createReminderSchema = z.object({
  title: z.string().trim().min(1, "Reminder text is required").max(300),
  dueAt: z.coerce.date().optional(),
  hasTime: z.boolean().optional(),
})

// PATCH: every field optional, but at least one must be present. `dueAt` is nullable so a
// reminder's due date can be cleared.
export const updateReminderSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    dueAt: z.coerce.date().nullable().optional(),
    hasTime: z.boolean().optional(),
    done: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  })

export type CreateReminderInput = z.infer<typeof createReminderSchema>
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>
