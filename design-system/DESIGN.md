# JobTracker — Design System

> **Canonical, shared style guide for the whole product** — the web app and the
> Chrome extension. Any agent or person doing UI/UX work in this workspace reads
> this first, then builds against [`tokens.css`](./tokens.css) (the source of
> truth for actual values). Keep it simple; don't fork tokens into components.

---

## 1. The feel (what we're going for)

JobTracker is for **younger, tech-savvy job seekers** drowning in tabs, deadlines,
and a spreadsheet they forgot to update. The product's emotional core is *calm
relief* — "never lose a job posting again." The UI should feel **warm, friendly,
and quietly confident**, never corporate, sterile, or hype-y.

**Aesthetic family: warm editorial + hand-drawn.** Think Granola / Mercury warmth
crossed with a personal, illustrated touch — *not* the default SaaS look (purple
gradients, glassmorphism, neon-on-black, teal-accent-on-white).

- **White canvas, cool-neutral panels.** The page background is clean white; raised
  surfaces (cards, popovers, sidebar) are a cool, very-low-chroma neutral off-white
  (faint stone/slate, hue ~248). The earlier warm cream read muddy next to white, so
  surfaces went cool — and **fern is now the system's only warm note**, which is
  enough. Depth reads through the faint tonal step plus a near-invisible hairline,
  not heavy borders or shadow.
- **One separation mechanism — not container soup.** For a feed of similar items,
  default to a single flat panel + whitespace + hairline dividers (the folk/Linear
  pattern), *never* border + tinted fill + inner dividers stacked together. Reserve
  fully-bordered cards for genuinely bounded, heterogeneous objects.
- **Fern green, not emerald/mint/teal — and rationed.** Our green is grounded and
  leafy — deepened to "evergreen": a deep, ink-like forest green that reads
  editorial, not "app-store green." Spend it only where it means something: the
  logo, the one primary action, the active nav item, the saved state, and a
  single positive signal (e.g. response rate). Let neutral do ~90% of the work;
  status carries the rest of the meaning. **Clay** (warm muted terracotta) is
  the secondary accent — rarer still, never a button color, used for the
  second data-viz hue and small warm moments (replaces the old Sun/Butter
  yellow; `--sun` remains a deprecated alias).
- **Hand-drawn line art** (scribbles, underlines, sparkles) adds humanity. Used
  sparingly as accent (one or two real moments per screen), never as
  decoration-for-decoration's-sake.
- **Calm spacing, on a real scale.** Let things breathe, but on a strict rhythm
  (see §4) — equal, repeating gaps read "engineered," loose ones read "dragged
  around in a builder." Density is earned, not default.

## 1a. Extension surface (neutral variant)

The **web app** carries the full warm-paper + hand-drawn identity above. The
**Chrome extension** runs a deliberately quieter, more neutral *modern-SaaS*
surface so it reads as a real product overlaid on third-party sites (LinkedIn,
Greenhouse, …) rather than a warm-toned widget that clashes with the host page:

- **Near-white / white surfaces**, not cream. Neutral-gray hairlines and
  secondary text (cool ~hue 250, very low chroma) instead of warm tones.
- **Fern stays the single accent** — primary actions, links, focus ring, the
  AI-prep "on" state, the toolbar badge. No second accent color.
- **Restrained weight.** Headings sit at `600` (not `700`); body/inputs at
  `400`. Bold is reserved for the few genuine emphases. Avoid all-caps micro
  labels.
- Tighter radii than the web app (≈`0.5–0.65rem` for controls/tiles).

These values are mirrored inline in `extension/popup/popup.css`,
`extension/ui/modal.js`, and `extension/ui/button.js` (the extension can't import
`tokens.css`). Keep them in sync. The web-app tokens in `tokens.css` are
unchanged — this is an extension-only surface treatment, not a product-wide
repaint.

## 2. Color

Use **semantic tokens** (`--primary`, `--muted-foreground`, `--border`, …) in
components. Reach for the named brand tones only for intentional brand moments.

| Token | Role |
|---|---|
| `--background` / `--foreground` | White canvas + near-black ink text |
| `--card` / `--popover` | Cool-neutral off-white raised panels (cards, popovers) |
| `--primary` (**Fern**) | Primary action, links, focus, active state — rationed, the only warm note |
| `--secondary` / `--muted` | Quiet cool surfaces (incl. row hover), secondary text |
| `--accent` | Soft fern-tinted highlight (active nav, subtle fills) |
| `--border` / `--input` / `--ring` | Near-invisible cool hairlines, field borders, fern focus ring |
| `--destructive` | Errors / destructive actions only |
| `--status-{saved,applied,interviewing,offer,rejected,archived}` (+ `-foreground`) | Pipeline status fill + readable text (the fg also drives the leading dot) |
| `--fern-50…700`, `--pine` | Evergreen brand scale (deep, ink-like green) |
| `--clay` / `--clay-soft` / `--clay-ink` | Secondary accent — warm terracotta (highlights, second data-viz hue). `--sun` is a deprecated alias of `--clay`. |
| `--chart-1…5` | Data viz (evergreen-led palette, clay as the lone warm hue) |

**Status tokens.** Each pipeline stage has a soft, **low-saturation, warm-leaning**
fill + foreground pair, so status reads as part of the paper world (not cool UI
blues/ambers). Render them via `StatusPill` (`bg-status-*` + `text-status-*-foreground`),
never as ad-hoc `amber-500`/`emerald-500` classes. Pills are reserved for genuine
status — plain metadata (location, salary) stays muted text, not a colored pill. The
resting "Saved" state renders *subtle* (dot + muted label, no fill) so a feed of saved
jobs doesn't flood with color.

**Rules**
- Don't introduce new raw colors in components. If you need one, add a token to
  `tokens.css` and document it here.
- Maintain **WCAG AA** contrast (4.5:1 body text, 3:1 large text / UI). The fern
  primary on paper passes; verify any new pairing.
- Color is never the *only* signal (pair with icon/text/weight).

## 3. Typography

Loaded as CSS vars by the web app; mirror the same families in the extension.

- **Headings / display / UI:** Plus Jakarta Sans (`--font-heading`, `--font-sans`)
- **Body / long-form:** Inter (`--font-body`)
- **Mono / code / data:** Geist Mono (`--font-mono`)
- DM Sans is available (`--font-dm-sans`) for incidental use.

**Weight scale (confident, not heavy).** Tokens in `tokens.css`:
`--weight-display: 700` / `--weight-heading: 600` / `--weight-medium: 500` /
`--weight-body: 400`, applied via the matching Tailwind named weights
(`font-bold`/`font-semibold`/`font-medium`/`font-normal`). **Extrabold (800) is not
in the product/app scale** — it's a small-UI slop tell; marketing/landing surfaces
may still go heavier. `tracking-tight` + `leading-[1.05]` are reserved for large
display (the dashboard greeting), not section labels or card titles.

**Decisive hierarchy.** One element leads per screen (e.g. the greeting, large +
`600`); section labels and card/row titles drop to small and quiet (`text-sm`),
metadata to `muted-foreground`. Open the size/weight gap — evenly-weighted type
reads templated. Body has `font-feature-settings: "cv01","ss01"` enabled globally.

## 4. Geometry & spacing

- **Radius** scales from one base, `--radius: 0.85rem` (rounded, friendly — not
  pill-everything, not sharp). Tailwind maps `sm→4xl` off it; prefer those. Hold the
  scale — no mixed/arbitrary radii.
- **Two spacing rhythms.**
  - **App / dashboard (product density):** a strict **4 / 8 / 12 / 16 / 24** scale
    → `gap-1/2/3/4/6`, rows `px-4 py-3`, stat strip `py-4`, section gaps `gap-8`.
    Content width ~`max-w-5xl`. Equal, tight, repeating rhythm.
  - **Landing / marketing (airy):** the generous scale — larger gaps (`gap-10/14`),
    section padding `py-28/32`, content width ~`max-w-6xl`.

## 5. Motion

Subtle, physical, opt-out-aware. Keyframes live in the web app's `globals.css`:

- `animate-fade-up` — content entrance (cubic-bezier(0.22,1,0.36,1), staggered
  via inline `animationDelay`).
- `animate-float-slow` — gentle ambient float for hero art.
- `draw-in` — SVG stroke draw for hand-drawn elements.
- **Always** honor `prefers-reduced-motion` (already handled globally — keep it).

Hover: small lifts (`hover:-translate-y-0.5`), 150–200ms transitions. Nothing
bouncy or attention-grabbing.

## 6. Signature texture utilities

Defined in the web app's `globals.css`; reuse, don't reinvent:

- `.glow-fern` — soft radial fern glow behind hero/CTAs.
- `.paper-dots` — faint dotted-paper backdrop (mask to fade edges).
- `.scribble` — recolor monochrome scribble SVGs to `currentColor` via masking.
- `::selection` is fern-tinted (`--fern-100` on `--pine`).

## 6a. Landing v5 marketing layer (webapp only)

The marketing landing ("playful paper", 2026-07-05 spec) adds a decoration-only
layer on top of these tokens, defined in `webapp/app/globals.css` and used
exclusively by `webapp/components/landing/v5/`:

- **Pally** (`--font-pally`, vendored) for sticker chips, hand-written
  annotations, and the giant footer wordmark — never body copy or product UI.
- **Two-color discipline (the landing's identity): one green marker + one
  highlighter.** Everything hand-made — stickers, scribbles, scratch-throughs,
  annotations, step numbers, the wordmark — is drawn in fern; **butter** is the
  single warm accent (headline highlight swipes, deadline warmth, one bento
  tile). Everything else is neutral paper/gray. Tokens: `--tint-{fern,butter}`
  (+`-ink` pairs). Do **not** add a third tint — the 2026-07-06 pass removed
  blush/sky/lilac because the page read as color overload. In-page product
  mocks follow the Bonsai register: neutral grays, big quiet numbers, fern
  spent on exactly one moment per mock (real brand logos are exempt — they're
  content). Tinted-tile budget: **one butter tile per bento**, plus the
  extension bento's fern anchor as the page's single fern field. `--sun`
  counts as butter-family (tiny decorative glints only). Fern remains the
  only *semantic* color; tints must not leak into the app or extension
  surfaces.
- Utilities/keyframes: `.hl`, `.sticker`, `.scrap`, `pop-in`, `wobble`,
  `type-reveal`, `confetti-fly`.

## 6b. Landing v6 marketing layer (webapp only) — CURRENT

Landing v6 ("notion+todoist for jobs", 2026-07-06) supersedes v5 on the live
page (`webapp/components/landing/v6/`; v5 kept on disk for revert). It was
rebuilt against circleback.ai / todoist.com / notion.com / kira-learning.com
references after v5 still read as AI-generated. What changed:

- **Stage palette replaces the two-color rule (landing only).** Butter is
  retired; fern stays the ONLY accent (CTAs, links, checks). New landing-only
  tokens in `webapp/app/globals.css`: `--stage-{peri,apricot,sage}` with
  `-soft`/`-ink` pairs plus `--hl-apricot`. These are saturated pastel **block
  backgrounds** (full-bleed rounded-[2rem] feature stages, the Circleback
  register), never button/link/text accent colors, and must not leak into the
  app or extension.
- **Mockups are believable mini-products, not skeletons.** Real strings, real
  brand logos, real `bg-status-*` chips, macOS `Window` chrome (`v6/bits.tsx`).
  Gray-bar skeleton mocks are banned; that was v5's core failure.
- Pally survives only as hand-written annotations (`Note` + `ArrowDoodle`) and
  the giant closer wordmark. Eyebrow budget: exactly two colored sentence-case
  `SectionLabel`s per page.
- Taste guardrails come from the `design-taste-frontend` skill
  (`.agents/skills/`, installed from Leonxlnx/taste-skill): zero em-dashes in
  visible copy, max one marquee, no pill eyebrows on every section.

### v6.1 mockup-realism pass (2026-07-07)

A studied pass against circleback.ai, notion.com, and evernote.com after the
mockups still read as "vibe coded": too rounded, too colorful, too crowded,
too animated. The register inside every product mockup is now:

- **Radii scale (Shape Lock).** Marketing panels `rounded-2xl` (16px, was
  2rem), `Window` chrome and popup `rounded-xl` (12px), inner cards
  `rounded-lg` (8px), status chips `rounded-[5px]` (Notion chips), buttons
  inside mockups `rounded-md`. Page-level CTAs stay pill (marketing layer).
- **Color inside a mockup ≈ zero.** White/gray surfaces, near-black text,
  gray meta; fern is the only accent (product CTAs, checkmarks). Status chips
  keep their muted `bg-status-*` pastels (semantic), everything else that was
  tinted (banners, badges, icon circles, deadline text) went gray. Real brand
  colors are allowed only where authentic (LinkedIn-blue Apply, company logos).
- **Nothing fake-alive.** No "Drop here" drag target, no sparkle "auto-filled"
  banner, no blinking caret, no pulsing/floating animations, no hand-drawn
  arrows over the hero. Mockups are STILL, like every reference.
- **Density like a real app.** Hairline-under-every-row is banned inside
  mockups (spacing groups rows, the Circleback register); Notion-style
  realism tricks instead: differing column counts, a 2-line card title,
  quiet `+ Add job` ghost rows, `Show 2 more...` overflow lines.
- **Composition.** Hero = ONE still window (no popup overlap, no annotations).
  The save popup lives only in the extension stage, top-right over the
  posting window, where a Chrome popup actually opens.

## 7. Dark mode

**Provisional.** Dark mode is currently a neutral gray baseline that does *not*
carry the fern/paper identity (primary becomes near-white). Treat as unfinished:
when dark mode becomes a real target, rework `.dark` in `tokens.css` to keep fern
as primary and use a warm-dark (not pure-neutral) surface. Don't ship dark mode
as a headline feature until then.

## 8. Anti-slop checklist (this product)

Before calling UI done, confirm it does **not**:

- [ ] Lead with a purple/blue gradient hero or glassmorphic cards.
- [ ] Use generic teal/emerald as the accent (we are **fern**, specifically).
- [ ] Wrap everything in nested bordered "container soup."
- [ ] Use default system serif or unstyled `font-family`.
- [ ] Center-align long paragraphs or use lorem-ipsum-flavored filler copy.
- [ ] Animate everything / use spinny attention-seeking motion.
- [ ] Ignore empty, loading, error, and focus states.

When in doubt, run the `ai-slop-check` and `polish-pass` skills (see
[`README.md`](./README.md)).

## 9. States & accessibility (non-negotiable)

Every interactive component ships **default · hover · active · focus-visible ·
disabled · loading**, plus **empty / error** states for any data surface. Focus
uses the `--ring` token (`outline-ring/50` is applied globally). Keyboard
operable, semantic HTML, labelled controls, AA contrast.

---

**Source of truth for values:** [`tokens.css`](./tokens.css).
**How to consume + which skills to use:** [`README.md`](./README.md).
