# Design System — how to consume & which tools to use

The shared design system for JobTracker. Four files, kept deliberately simple —
each with one job:

| File | What it is | Who imports it |
|---|---|---|
| [`tokens.css`](./tokens.css) | **Source of truth** — raw color/radius CSS variables (`:root`/`.dark`). Plain CSS, no framework. | Everyone (web app + extension) |
| [`theme.css`](./theme.css) | Tailwind v4 `@theme` mapping → shadcn-compatible utilities (`bg-primary`, `rounded-lg`, `font-heading`…). | Tailwind/shadcn apps only |
| [`DESIGN.md`](./DESIGN.md) | The canonical style guide (feel, type, motion, anti-slop, a11y). | People & agents |
| `README.md` (this) | How to consume + which design skill to use when. | People & agents |

## Consuming it

**Tailwind + shadcn app (the web app)** — two imports after Tailwind, then use
semantic utilities everywhere:

```css
@import "tailwindcss";
@import "../../design-system/tokens.css";  /* raw values */
@import "../../design-system/theme.css";   /* Tailwind/shadcn mapping */
```

Then: `bg-background`, `text-muted-foreground`, `border-border`, `text-primary`,
`bg-fern-100`, `font-heading`, `rounded-lg` … Never hardcode hex/oklch in a
component. (This is exactly how `webapp/app/globals.css` is wired.)

**Chrome extension (plain HTML/CSS)** — only needs `tokens.css`; ignore the
Tailwind mapping:

```css
@import "url(../design-system/tokens.css)";   /* or copy the file in */
/* then: color: var(--foreground); background: var(--primary); */
```

Keep the same font families (Plus Jakarta Sans / Inter / Geist Mono).

## shadcn integration

`components.json` already points at `app/globals.css` with `cssVariables: true`,
and `tokens.css` provides every variable shadcn expects (`--background`,
`--primary`, `--card`, `--radius`, `--radius-md`, …). So `npx shadcn add <comp>`
works as-is and components inherit the fern identity automatically.

**One gotcha:** when the shadcn CLI introduces a *new* token, it writes it into
`app/globals.css` (`:root`/`.dark`). To keep one source of truth, **move any such
new variables into `tokens.css`** (and add its `@theme` line to `theme.css` if it
needs a Tailwind utility). That's the only manual step.

**The one rule:** edit values only in `design-system/`. If a component needs a
value that isn't a token, add the token here first.

---

## Which design skill/resource to use (avoid redundancy)

A lot of design tooling is installed. They overlap — **do not run them all.** Pick
by the job in front of you. Rough order of reach-for:

**1 — Building real UI in this repo → `frontend-design` skill (primary).**
Anthropic's official skill for distinctive, production-grade frontend. This is the
default driver when writing components/pages. Feed it `DESIGN.md` as the brief.

**2 — Need structured direction / a checklist → `ui-ux-pro-max` skill.**
Good for planning (styles, palettes, font pairings, product-type UX guidelines)
and for reviewing UI/UX. Use for *planning & review*, not as a second renderer
alongside `frontend-design` (that's the redundancy to avoid — pick one to drive).

**3 — Targeted design passes → trystan skills (`~/.claude/skills/`).**
Single-purpose, composable. Reach for the specific one:
`discovery-questions` (clarify) · `frontend-aesthetic-direction` (commit a look) ·
`wireframe` · `generate-variations` · `interaction-states-pass` ·
`hierarchy-rhythm-review` · `accessibility-audit` · **`ai-slop-check`** ·
`polish-pass` · `component-extract` · `design-system-extract` · `make-tweakable`.

**4 — Anti-generic prompts & aesthetic references (`~/.claude/prompts/`,
`~/.claude/design-systems/`).** `break-default-aesthetic.md` and
`anthropic-frontend-aesthetics.md` when output drifts toward AI defaults. The
`design-systems/<family>/*.md` files (linear, vercel, granola, mercury, …) are
reference DNA — borrow *principles*, never clone a site.

**5 — `designer-skills` marketplace plugins** (design-research, ux-strategy,
interaction-design, etc.): heavier, process-oriented. Use only for genuine
research/strategy work, not day-to-day component building.

**6 — `web-design-guidelines` skill:** final compliance review of finished UI.

### Conflict resolution
- **`DESIGN.md` wins.** Any skill's generic advice that contradicts our committed
  fern/warm-paper/hand-drawn identity is overridden by `DESIGN.md`.
- **One renderer at a time.** `frontend-design` *or* `ui-ux-pro-max` builds a given
  surface — not both. The other reviews.
- **Process before implementation** (per Superpowers): brainstorm → direction →
  build → slop-check → polish → a11y. Don't skip to rendering.
- **`landing-effects`** (npm, in the web app) supplies pre-built landing animation
  effects — reach for it for marketing-page flourish, but keep motion subtle per
  `DESIGN.md §5` and honor `prefers-reduced-motion`.

> Goal: Linear/Notion/Mercury-grade taste. When unsure, do less, space more, and
> run `ai-slop-check` before declaring done.
