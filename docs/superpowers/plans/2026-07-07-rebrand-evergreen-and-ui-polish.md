# Rebrand: Evergreen + Clay, Landing Revamp, Anti-Slop UI Pass

**Date:** 2026-07-07 · **Branch:** `feat/rebrand-evergreen` · **Base:** `12607fe`

## Why

The current fern green (`oklch(0.58 0.13 150)` = #348f4f) reads as a bright,
mid-lightness "default AI green" — the exact register the user wants gone. The
butter/sun yellow secondary reads mustard. The rebrand moves the whole product
(webapp, extension, emails, landing, docs) to a deeper, quieter, more
premium palette in the Notion / Circleback / Linear register, then runs a
copy + taste revamp on the landing and an anti-slop pass over app + extension.

## The new palette (pinned values — use verbatim)

All values validated for WCAG AA (script: scratchpad/contrast.mjs; results in
plan appendix). Brand name stays "jobhq" (lowercase).

### Primary — **Evergreen** (Fern, deepened)

Deep, grounded forest green. Reads ink-like and editorial, not "app-store
green". **Token NAMES stay `--fern-*` / `--pine`** (dozens of consumers via
Tailwind `bg-fern-100`, `text-pine`, etc. — renaming is churn with zero visual
gain); only VALUES change. DESIGN.md re-describes fern as "evergreen —
deep forest ink".

| Token (name unchanged) | New value | Hex (ref) | Old value |
|---|---|---|---|
| `--primary` / `--ring` / `--sidebar-primary` / `--sidebar-ring` | `oklch(0.46 0.085 158)` | #266645 | `oklch(0.58 0.13 150)` |
| `--primary-foreground` (+sidebar) | `oklch(0.985 0.005 160)` | #f7fbf9 | `oklch(0.99 0.01 145)` |
| `--fern-50` | `oklch(0.972 0.012 158)` | #f0f8f3 | `oklch(0.97 0.025 145)` |
| `--fern-100` | `oklch(0.945 0.025 158)` | #e0f2e6 | `oklch(0.93 0.05 145)` |
| `--fern-600` (hover) | `oklch(0.42 0.08 158)` | #1e5a3c | `oklch(0.52 0.13 150)` |
| `--fern-700` | `oklch(0.36 0.065 160)` | #184731 | `oklch(0.43 0.11 152)` |
| `--pine` | `oklch(0.27 0.04 162)` | #122d20 | `oklch(0.3 0.06 158)` |
| `--accent` / `--sidebar-accent` | `oklch(0.945 0.02 158)` | — | `oklch(0.93 0.04 145)` |
| `--accent-foreground` (+sidebar) | `oklch(0.33 0.055 160)` | #183e2b | `oklch(0.33 0.06 155)` |

Contrast: white on primary **6.82** · primary as text on white **6.82** ·
accent-foreground on fern-100 **10.2**. All AA.

### Secondary accent — **Clay** (replaces Sun/Butter yellow)

Warm muted terracotta. Used for: warm highlights, the second data-viz hue,
small warm moments the yellow used to own. NOT a button color; evergreen
remains the only action color.

| Token | Value | Hex (ref) |
|---|---|---|
| `--clay` (new) | `oklch(0.66 0.115 50)` | #ca7c4e |
| `--clay-soft` (new) | `oklch(0.945 0.028 55)` | #fde8dc |
| `--clay-ink` (new) | `oklch(0.46 0.095 45)` | #834527 |

`--sun` becomes `--sun: var(--clay);` (deprecated alias so v5-landing/archive
files keep compiling; live code migrates to `--clay`). Add the three clay
tokens to `design-system/theme.css` `@theme inline` mapping so `bg-clay`,
`text-clay-ink`, `bg-clay-soft` exist as utilities. Contrast: clay-ink on
clay-soft **6.27**, clay-ink on white **7.41** (AA); raw clay is fill/large-UI
only (white-on-clay 3.2 = AA-large).

### Everything else

- **Status tokens:** keep the muted pastel system but re-seat green-family hues
  onto the new hue axis (saved/offer to hue 158/156 range, chroma unchanged) so
  chips harmonize with evergreen. Applied/interviewing warm hues shift from
  yellow-mustard (85/65) toward clay (60→55) at the same L/C. Small nudges, not
  a redesign.
- **Charts:** `--chart-1..5` rebuilt fern-led → evergreen-led: 0.46/0.085/158,
  0.62/0.07/155, 0.36/0.065/160, clay 0.66/0.115/50, pine 0.27/0.04/162.
- **Dark mode:** stays provisional, but `--primary` in `.dark` becomes
  `oklch(0.78 0.07 158)` (light evergreen, not near-white) with
  `--primary-foreground: oklch(0.22 0.03 160)` so dark mode stops being
  brandless. No other dark rework.
- **Neutrals, radius, type, spacing: unchanged.** This is a repaint, not a
  re-layout.

## Global constraints (bind every task)

1. Use the pinned oklch values above **verbatim**. No new raw colors anywhere;
   add a token if a task genuinely needs one and document it in DESIGN.md.
2. Evergreen is rationed exactly as fern was: one primary action, active nav,
   links, focus, logo. Clay is rarer still. Neutral does ~90% of the work.
3. No mustard/butter yellow anywhere when done (`--sun` alias may remain
   defined but must have zero non-alias consumers).
4. WCAG AA holds for every new pairing (4.5 body / 3.0 large+UI).
5. Landing copy: no em dashes, no "quirky" AI phrasing, sentence case,
   short declarative sentences (Notion/Linear register).
6. Extension keeps its neutral white surface treatment (DESIGN.md §1a) — only
   its green accent value changes, not its neutrality.
7. Webapp must compile: `cd webapp && npx next build` (or at minimum
   `npx tsc --noEmit`) passes. Extension tests: `cd extension && ./node_modules/.bin/vitest run` passes.
8. Don't touch backend/API logic. UI additions to app pages use dummy data
   only if they surface data we already store.

## Tasks

### Task 1 — Token repaint (design-system + webapp theme)
Files: `design-system/tokens.css`, `webapp/app/globals.css` (Tailwind @theme
mapping, `--tint-*`/`--stage-*` landing tokens, `.glow-fern`, `.hl`,
`::selection`, any color-bearing keyframes), plus any `bg-[oklch(...)]`-style
arbitrary values in webapp that encode old fern/sun raw values (inventory
below). Rename utilities referencing fern (e.g. `.glow-fern` → keep the class
name working; add `.glow-evergreen` alias if renamed). Update `--stage-*`
pastels only if they clash with the new evergreen (sage stays, apricot family
harmonizes with clay). Verify with tsc/build.

### Task 2 — Extension repaint
All inlined brand colors in `extension/` (popup css/html, ui/*.js modules,
content.js, icons/SVGs) move from old fern hexes to the new evergreen values
(hex equivalents from the appendix). Keep neutral surface treatment. Run
extension vitest suite.

### Task 3 — Email templates repaint
`webapp/lib/email/templates.ts` (and any other email HTML): replace old
greens/yellows with evergreen/clay hexes; emails use hex (no oklch — email
client support). Keep layout; improve only obvious slop (excessive borders,
loud buttons) within the template.

### Task 4 — Landing revamp: visual + structure
`webapp/components/landing/v6/*` + `webapp/app/page.tsx` + landing-only tokens.
New colors reflected; every gradient audited (no gray-on-white washes, no
default two-stop AI gradients — prefer flat tints or very subtle same-hue
ramps); shadows restrained; hierarchy pass. Implementer must invoke
`design-taste-frontend` + `ai-slop-check` skill guidance. Mockups keep the
v6.1 realism register (DESIGN.md §6b).

### Task 5 — Landing copy rewrite
Same files, copy only. Implementer must invoke `landing-page-copywriter` and
`stop-slop` skills, and study (WebFetch) notion.com, circleback.ai,
simplify.jobs, linear.app current landing copy for register: short, concrete,
benefit-first, human. Rewrite hero, feature sections, CTAs, FAQ, closer.
No em dashes, no "Supercharge/Unleash/Effortless", no exclamation marks.

### Task 6 — Webapp app-surface anti-slop pass
Dashboard shell/nav, job list/kanban/detail, settings, resume/cover-letter
pages, modals, loading/empty/error states, buttons, toasts. Goal: from
weekend-project to Notion/Linear-grade. Fix: container soup, uniform type
weight, excessive shadows, redundant labels (RefactoringUI: labels are a last
resort), unclear hierarchy. May add small UI affordances using existing data
only (dummy data acceptable). Invoke `visual-hierarchy` +
`hierarchy-rhythm-review` skill guidance.

### Task 7 — Extension UI anti-slop pass
Same intent as Task 6 for popup + in-page panels (application tab, todo,
resume, modal). Keep neutral register; tests pass.

### Task 8 — Docs + design-system sync
DESIGN.md (palette section rewrite: Evergreen/Clay, deprecate fern/butter
naming, update §6a/6b color language), design-system README, any MD that
documents colors. Update anti-slop checklist with lessons from Tasks 4–7.

## Deliverable outside the repo
After all tasks: an AI logo-generator prompt (minimalist abstract mark,
Notion/Linear/Todoist register, evergreen #266645 on white) — written by the
controller in the final summary, not a repo file.

## Appendix: hex references for non-CSS surfaces (emails, SVG fills, JS)
- evergreen (primary): `#266645`
- evergreen hover/600: `#1e5a3c`
- evergreen 700: `#184731`
- evergreen 100 tint: `#e0f2e6`
- evergreen 50 tint: `#f0f8f3`
- pine ink: `#122d20`
- clay: `#ca7c4e` · clay-soft: `#fde8dc` · clay-ink: `#834527`
- ink text: `#141a17` · primary-foreground: `#f7fbf9`

## Inventory (from repo-wide sweep, 2026-07-07) — per-task file targets

**CRITICAL duplication fact:** `design-system/tokens.css` + `theme.css` are
vendored byte-identical at `webapp/design-system/`; `npm run sync:tokens`
(a cp, auto-run on pre-dev/pre-build) regenerates them. Edit the CANONICAL
root files, then run `cd webapp && npm run sync:tokens` and commit both.

### Task 1 targets (tokens + webapp theme)
- `design-system/tokens.css` — `:root`: `--primary` L30, `--ring` L47,
  `--fern-50/100/600/700` L66–69, `--pine` L70, `--sun` L71 (→ alias of new
  `--clay` trio), `--accent`/`--accent-foreground` L40–41, `--chart-1..5`
  L74–78 (1=fern 4=sun 5=pine → evergreen-led + clay), `--sidebar-primary`
  L96, `--sidebar-accent(-fg)` L98–99, `--sidebar-ring` L101, status tokens
  L52–63 (hue nudges only: saved/offer → hue 158/156; applied/interviewing
  hue 85/65 → 60/55). `.dark` block: `--primary` → `oklch(0.78 0.07 158)` +
  fg `oklch(0.22 0.03 160)`, `--sidebar-primary` L148 (stale blue-violet
  `264.376` — fix to dark evergreen), dark status greens re-hued, dark
  charts stay neutral.
- `design-system/theme.css` — add `--color-clay/clay-soft/clay-ink` mappings;
  keep everything else (names unchanged).
- `webapp/app/globals.css` — `--tint-fern(-ink)` L49–50 re-hue to 158;
  `--tint-butter(-ink)` L51–52 → re-point at clay-soft/clay-ink values;
  `--stage-apricot*` L63–65 + `--hl-apricot` L69 harmonize with clay (hue
  50–55); `--stage-sage*` L66–68 re-hue 150→158; `.brand-surface` L115–119,
  `.brand-surface-cool` L120–124, `.brand-surface-warm` L125–129,
  `.brand-surface-deep` L131–135, `.glow-cell` L145–150 — rebuild these
  gradients on the deep evergreen ramp (quiet, same-hue, no loud multi-hue
  sweeps); `.accent-rule` L153–155 (`--sun`→`--clay`); `pulse-once` L384–392
  + `site-header-haze` L433–448 color-mix values; `::selection` L86–89 and
  `.glow-fern` L94–97 follow token values automatically (verify).
- Then `npm run sync:tokens`; verify `cd webapp && npx tsc --noEmit`.

### Task 2 targets (extension) — old fern hexes → new (see appendix hexes)
- `extension/popup/popup.css` L19–46: `--primary`/`--primary-hover`/`--ring`
  oklch(0.58 0.13 150)/(0.52 0.13 150) → new primary/600; `--accent`
  oklch(0.95 0.035 150) + `--accent-foreground`; `--st-fern-*`; `--st-amber-*`
  → clay-family.
- `extension/ui/modal.js` L88–123 `tokens()`: `--accent`, `--accent-press`,
  `--accent-ink`, `--accent-bg`, `--ring` L122, `--star`/`--star-ink`
  (amber → clay `oklch(0.66 0.115 50)` / `oklch(0.52 0.1 48)`), status tokens
  L114–119 (mirror Task 1 nudges), stray fern alphas L551.
- `extension/ui/button.js` L19–25 `TOKENS` object.
- `extension/ui/field-picker.js` L44–76: `#3f9b6a`→`#266645`, `#2f7b53`→`#1e5a3c`,
  `#1a2b22`→`#122d20`, `#eaf3ee`→`#f0f8f3`, `#8fe0b3`→`#9ecfb4` (light mint on
  dark chip — pick a readable light evergreen tint).
- `extension/ui/doc-drag.js` L25 `OK_COLOR #3f9d5f` → `#266645`.
- `extension/background.js` L533 badge `#3f9b6a` → `#266645`.
- `extension/icons/icon{16,32,48,128}.png` — re-export via ImageMagick
  (`/usr/bin/convert` available): recolor source or regenerate simple
  rounded-square evergreen mark; keep sizes/names.
- Run `cd extension && ./node_modules/.bin/vitest run`.

### Task 3 targets (email)
- `webapp/lib/email/templates.ts`: `#3f9b6a` at L16, L35, L39, L61, L76, L83
  → `#266645` (button bg, eyebrow, digest accent bar). Paper `#f5f3ee` may
  warm-shift only if needed; keep neutral inks.

### Task 4 targets (landing visual) — LIVE v6 only + shared assets
- `webapp/components/landing/v6/*`: closer.tsx L10 gradient (fern→pine ramp →
  evergreen ramp), bits.tsx L148 + hl L38/44, mock-dashboard.tsx L111,
  feature-duo.tsx L52, hero/feature-app/feature-extension stage-token usage
  (tokens already re-hued by Task 1 — verify visually coherent).
- `webapp/components/landing/logo.tsx` L44 `text-[oklch(0.82_0.14_150)]` →
  light evergreen tint oklch(0.84 0.08 158); cta.tsx L15 glow.
- `webapp/public/landing/motif.svg` (`#67c07c`, `#006125`) and
  `divider-hills.svg` (`#348F4F`, `#F1C45E`) → evergreen ramp + clay.
- LEAVE ALONE: v4 `components/landing/hero.tsx` navy, v5/* (revert archive),
  macOS traffic-light dots, LinkedIn blue, Google/Chrome logo hexes.
- Gradient rule: no multi-hue AI sweeps; same-hue L-ramps only.

### Task 6 extra targets (app surfaces)
- `components/dashboard/job-detail/application-field.tsx` L134/153
  `oklch(0.48 0.11 85)` amber star + L329 `oklch(0.65 0.13 75)` amber →
  clay-ink/clay; application-form.tsx L52 same.
- `webapp/app/favicon.ico` — regenerate evergreen via ImageMagick.
- `app/jobapplication/page.tsx` violet/blue doc-preview accents: out of
  brand scope, leave unless trivially harmonizable.

### Not in scope
Third-party brand hexes (Google, Chrome, LinkedIn, macOS window dots),
Next.js boilerplate SVGs, raster scene art under `public/landing/scenes|bg`
(illustration content, revisit later), v4/v5 landing archives.
