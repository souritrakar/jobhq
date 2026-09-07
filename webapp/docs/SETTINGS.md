# Settings: profile & autofill details

The `/dashboard/settings` page where a user saves their personal details **once** so the
repetitive, formality parts of job-application forms (name, contact, location, work
eligibility, links, EEO self-ID) can be prefilled later by the extension.

> **Status: persisted.** The form is wired to a real `UserProfile`
> table through the standard `route → validation → service → db` layering. Read
> [`BACKEND.md`](BACKEND.md) for that layering before changing any of it.

## What exists

| Piece | Path |
| --- | --- |
| Page (server) | `app/dashboard/settings/page.tsx` — fetches the profile, seeds identity, passes `initial` |
| Form (client) | `components/dashboard/settings/settings-form.tsx` — saves via `PUT /api/profile` |
| Field shape + options | `components/dashboard/settings/profile-settings.ts` |
| Validation | `lib/validations/profile.ts` — Zod mirroring `ProfileSettings`, constrained fields checked against the `*_OPTIONS` sets |
| Service | `lib/server/profile.ts` — `getProfile` / `upsertProfile` / `toClientProfile` (user-scoped) |
| API | `app/api/profile/route.ts` — `GET` (also the extension's autofill source) + `PUT` |
| Client helper | `lib/profile/client.ts` — `saveProfile` |
| Model | `UserProfile` in `prisma/schema.prisma` (1:1 with `User`) |
| New UI primitives | `components/ui/{label,select,switch}.tsx` (Base UI, `base-nova` style) |

`profile-settings.ts` holds the **`ProfileSettings` type — the single source of truth**
for the field set. The future schema/API mirrors these field names; keep them stable.

## Field groups (the "comprehensive" set)

1. **Personal details** — first/last/preferred name, pronouns, email, phone
2. **Location & address** — country, state, city, postal code, street, line 2
3. **Work eligibility** — work authorization, visa status, requires-sponsorship toggle
4. **Professional links** — LinkedIn, portfolio, GitHub
5. **Job preferences** — current title/company, desired salary + currency, notice period,
 earliest start date, remote preference, open-to-relocation toggle
6. **Voluntary self-identification** (EEO, collapsed, optional) — gender, race/ethnicity,
 veteran status, disability status, each with a "Prefer not to say" option

Constrained fields (pronouns, work auth, remote pref, notice period, currency, and all
EEO fields) use the `*_OPTIONS` lists in `profile-settings.ts`.

## Interaction model

Matches the **manual batched-save** pattern used elsewhere (no autosave): all fields are
controlled local state seeded from `EMPTY_PROFILE`. A sticky bottom save bar appears only
when the form is **dirty** (`JSON.stringify` diff vs the last-saved snapshot) and offers
**Save changes** / **Discard**. The avatar is a non-functional initials placeholder
(upload comes with auth + storage later).

Saving is manual + batched (no autosave): `save` in `settings-form.tsx` PUTs the whole
profile, then reflects the server's normalized response back into both the working and
last-saved snapshots so the form goes clean. A failed save surfaces the server's message in
the save bar and keeps the changes editable.

## Backend

Follows the standard `route → validation → service → db` layering, `userId`-scoped via the
`getUserId` seam (so the extension's dev seam and real Neon Auth both work):

- **`UserProfile` model, 1:1 with `User`, typed columns** (not columns on `User`, not a JSON
 blob). Rationale: Neon Auth sync (`ensureUser`) upserts identity onto `User` only and
 *cannot* clobber app-owned profile data; the field set is stable and bounded so typed
 columns give Prisma types + Zod validation end to end. Every column is nullable.
- **EEO / voluntary self-ID fields live in the same table**, nullable and opt-in. Can be
 split into a dedicated `UserDemographics` table later if compliance needs grow.
- **Name & contact email are app-owned but auth-seeded** — `settings/page.tsx` seeds the
 empty name/email fields from the signed-in identity (`getSessionUser`) on first load; the
 user can override for applications, and the override is what persists in `UserProfile`.
- **`earliestStartDate` stored as `String?` (`YYYY-MM-DD`)** — a calendar label, no TZ math.
- Constrained fields (pronouns, work auth, EEO, …) are **plain strings validated by Zod**
 against the `*_OPTIONS` sets — not DB enums (the lists will evolve).
- **Wire shape:** the client speaks `ProfileSettings` (all strings, two booleans). The
 service maps DB `NULL` → `""` on read (`toClientProfile`) so the controlled inputs always
 get a string, and `""` → `NULL` on write so the table stays clean.

`GET /api/profile` returns the saved profile or `null` (no row yet — the page then seeds
identity); it is also the **extension's autofill source**. `PUT /api/profile` upserts.

## Onboarding

The post-signup flow at `/onboarding` writes into this same `UserProfile` table — full design
in the design spec. Facts that matter here:

- **New columns:** `targetRole`, `searchStage`, `priorities String[]` (all editable in
 Settings → Job preferences) and `onboardedAt DateTime?`.
- **Gate:** the dashboard layout redirects to `/onboarding` when the user has **no
 `UserProfile` row** (`needsOnboarding`). Completing or skipping the flow always creates the
 row via `POST /api/onboarding` (`completeOnboarding`), so pre-feature users who saved
 Settings are never funneled back.
- **Wire shape grew:** `ProfileSettings` now carries `targetRole`, `searchStage` (strings)
 and `priorities` (string array, max `PRIORITIES_MAX`); `GET /api/profile` (extension
 autofill source) grows additively.
- **Greeting:** the dashboard home greets with `preferredName || firstName` from the profile
 (`getGreetingName`), falling back to the auth identity's name.
