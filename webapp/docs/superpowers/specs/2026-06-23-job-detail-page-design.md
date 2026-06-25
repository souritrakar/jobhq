# Job Detail Page — Design Spec

**Date:** 2026-06-23
**Status:** Approved (direction), implementing

## Goal

A per-job detail page reachable by clicking a job in the dashboard or saved list. It
reads one `Job` (+ its 1:1 `JobApplication`) from the DB and presents it with strong
visual hierarchy: the important details first, then an "answer-ready" rendering of the
extracted application questions (Task 2). Sidebar persists (lives under `app/dashboard/`).

## Route & data

- **Path:** `app/dashboard/jobs/[id]/page.tsx` — server component under the dashboard
  layout, so `DashboardShell`'s sidebar persists automatically. Same-tab navigation.
- **Fetch:** existing `getJob(userId, id)` (already `include: { application: true }`).
  `notFound()` when the service throws (wrap in try/catch → Next `notFound()`).
- **No backend changes:** `PATCH`/`DELETE /api/jobs/[id]` already exist; `updateJobSchema`
  already covers `status`, `notes`, `deadline`.
- **Navigation wiring:** dashboard `JobRow` and saved `JobCard` get an in-app link to
  `/dashboard/jobs/[id]` (today the title links out to the original posting). The external
  posting stays reachable from the detail page's "Open original ↗" action.

## Layout

Two columns from `lg`, single column below. Page container matches dashboard width.

```
← Back to saved
HEADER:  logo · Title (display) · Company · via source        [Status ▾] [Open original ↗] [⋯]
MAIN (left, ~2/3)                                   |  RAIL (right, ~1/3, sticky)
  Key-facts strip (icon-led, scannable)             |   Tracking: status ▾, deadline, dates, source
  About the role (description, clamp + show more)   |   Notes (inline-editable)
  Application form (answer-ready)                   |   ······
                                                    |   Delete job (quiet danger zone)
```

### Hierarchy of job details (most-important-first)
1. **Identity (Tier 1):** logo tile (larger), title (`text-2xl/3xl` display weight),
   company + source, status pill.
2. **Key facts (Tier 2):** icon-led strip — salary (fern, the scan value), location,
   workplace type, employment type, deadline (with urgency label). Each lucide icon +
   value; omit absent fields; never leave holes.
3. **Description (Tier 3):** readable prose, line-clamped with "Show more".

### Action distribution (don't crowd the header)
- **Header:** status changer (pill → menu, primary pipeline control) · `Open original ↗`
  (only if `url`) · `⋯` overflow → Delete.
- **Rail "Tracking":** canonical status changer + deadline + saved/updated dates + source.
- **Rail bottom:** `Delete job` quiet danger zone (confirm via alert-dialog).
- **Notes:** own rail panel, inline-editable (textarea → Save/Cancel, PATCH `notes`).

## Application form (Task 2) — "answer-ready preview"

Client component. Renders each question as its real control by `type`, interactive
locally (`useState` per field), **not yet persisted** — structured so AI-drafts + saving
slot in later without redesign.

- **Field renderer map** (`type → control + lucide icon + meta`):
  - `short_text|email|url|tel|number` → `Input` (native `type`), type-appropriate icon.
  - `long_text` → textarea.
  - `select` → base-ui Select (single).
  - `radio` → base-ui RadioGroup (segmented/stacked).
  - `multi_select` → base-ui CheckboxGroup (multi).
  - `checkbox` → options→CheckboxGroup; single (no options) → consent checkbox row.
  - `date` → date input.
  - `file` → styled dropzone affordance (non-functional, attaches nothing).
- **Each field:** small type-icon chip, label, required `*`, helpText sub-label, flagged
  `★` marker when `flagged`.
- **Subtle AI:** answerable text/long_text fields show a quiet `✦ AI draft` affordance,
  disabled with a "AI prep coming soon" tooltip — the AI-prep TODO boundary.
- **Form header:** `N questions · M required · K flagged`. Tasteful empty state when the
  job has no captured application form.

## Components (new, under `components/dashboard/job-detail/`)

- `job-detail-header.tsx` (client — status menu + actions)
- `job-facts.tsx` (server — icon-led facts strip)
- `job-description.tsx` (client — clamp/show-more)
- `tracking-rail.tsx` (client — status, dates, notes editor, delete dialog)
- `notes-editor.tsx`, `delete-job-dialog.tsx` (or inline in rail)
- `application-form.tsx` (client) + `application-field.tsx` + `field-meta.ts`
  (type → icon/label/control mapping)
- `lib/jobs/client.ts` — tiny fetch helpers for PATCH/DELETE (envelope-aware)

## Design language

Reuse warm-paper + fern tokens, Satoshi, lucide, existing primitives (Card, Button,
StatusPill, LogoTile). Hairline dividers + whitespace as the single separation mechanism;
fern rationed to salary + primary actions + active states. Match dashboard density;
tighten where it improves scanning. Full interaction states + reduced-motion respected.

## Out of scope (now)

Persisting answers, real AI answering, file upload handling, auth (stub stands).
