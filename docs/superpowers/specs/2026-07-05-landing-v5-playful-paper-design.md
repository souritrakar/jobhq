# Landing v5 — "A calm desk for a chaotic job search" (playful paper)

**Date:** 2026-07-05 · **Status:** approved by Souritra (direction: playful leads, crisp follows, generous air; iterate until satisfied)

## Goal

Redesign `webapp/app/page.tsx` (marketing landing) to market **both** the Chrome
extension and the web app with a "notion for jobs" personality — playful,
human, clearly not AI-generated — while staying crisp and airy (Linear-grade
discipline underneath). References: Kira (color-block playfulness, characters,
collage footer), tiimo/droplist (soft pastel warmth), Mintify/Acctual/Dia
(crisp air, restrained bentos). Success = the page sparks enough interest and
delight that a visitor wants to install/sign up.

## Non-negotiables

- Keep the design system: white/paper canvas, **fern** as the only meaningful
  color, hairline borders, Satoshi as product face. Pastels are decoration-only.
- Bento grids, abstract UI product mockups (based on real app screenshots),
  abstract SVG illustration/characters/arrows, striking hero, motion +
  scroll animations throughout. `prefers-reduced-motion` honored everywhere.
- No walls of text; show > tell. No purple-gradient/glassmorphism slop, no
  container soup, no evenly-weighted templated type.

## Decisions

- **Hero background:** retire the starry-night scenic hero; daylight paper
  canvas with subtle dotted grid. (Old components stay on disk for revert.)
- **Type:** Satoshi bold headlines with highlighter-span + scribble treatments;
  **Pally** (vendored `app/fonts/pally.woff2`) only for playful accents —
  sticker badges, eyebrow chips, giant footer wordmark.
- **Color:** add landing-only pastel tint tokens (`sun` exists; add blush, sky,
  butter — low-chroma) used as bento fills/highlights; fern stays rationed.
- **Motion:** CSS + IntersectionObserver only (no new deps): staggered
  fade-up reveals, SVG stroke draw-in, slow float on stickers/toasts, logo
  marquee, autofill typing loop, confetti micro-burst on hero check.
- **Mockups:** screenshot the real dashboard/job page via Playwright, rebuild
  as simplified JSX mockups with real proportions; extension side-panel mockup
  overlaps the dashboard in the hero (both products in one shot).

## Page flow (10 beats)

1. **Floating pill nav** — rounded white bar, logo, links, fern "Add to Chrome".
2. **Hero** — highlighter headline + rotating-word subline (kept), dual-product
   composite mockup, floating toasts ("Saved from LinkedIn", "Deadline found ·
   Friday", confetti check), peep leaning on frame, tilted paper job-cards.
3. **Problem beat** — "Your job search doesn't need another ~~spreadsheet~~."
   scribbled strikethrough; sticky-note scatter resolved by a squiggle into one
   clean card (Kira "they need a system" analog).
4. **How it works** — 3 steps, scribble arrows, mini UI vignettes, draw-in.
5. **Bento #1 — extension** ("Catch jobs where they happen"): one-click save
   (logo row), questions auto-captured, autofill typing animation, live 2-way sync.
6. **Bento #2 — app** ("…then it all lives in one calm place"): pipeline board,
   reminders/digest, cover-letter generator, notes & to-dos.
7. **Works-everywhere strip** — site logos on hand-drawn wavy shelf, marquee.
8. **Who it's for** — 3 peeps with sticker badges (grad, switcher, 200-tabs).
9. **FAQ** — compact, quiet.
10. **Final CTA + collage footer** — pastel paper-scrap collage ("offer!",
    "interview @ 2pm", "followed up ✓"), giant playful fern wordmark bleeding
    off the bottom.

## Build notes

- New components live in `webapp/components/landing/` alongside kept utilities
  (`reveal`, `rotating-word`, `brand-logo`, `chrome-button`, `scribbles`, `peep`).
- Old v4 sections remain on disk until v5 is accepted, then get cleaned up.
- Iterate with a Playwright screenshot → critique → fix loop at desktop and
  mobile widths before calling done (anti-slop + polish pass).
