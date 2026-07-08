import { Reveal } from "../reveal";
import { BrandLogo } from "../brand-logo";
import { Icon } from "../dashboard-mock";
import { Sticker, TINT } from "./bits";

/* The Kira beat — name the fragmentation, then resolve it into one clean card.
   Show, don't lecture: the chaos is a scatter of paper scraps; the fix is a
   single tidy job card that a scribbled line "collects" them into. */

/* The chaos is gray — color belongs to the fix, not the mess. One butter
   scrap keeps a pulse of warmth. */
const SCRAPS: {
  label: string;
  tint: keyof typeof TINT;
  rotate: number;
  className: string;
}[] = [
  { label: "tab #47", tint: "neutral", rotate: -6, className: "left-[4%] top-2 hidden lg:inline-flex" },
  { label: "screenshot_final2.png", tint: "neutral", rotate: 4, className: "right-[3%] top-0 hidden lg:inline-flex" },
  { label: "bookmarked (never opened)", tint: "butter", rotate: -3, className: "left-[1%] top-[46%] hidden lg:inline-flex" },
  { label: "notes app, somewhere", tint: "neutral", rotate: 5, className: "right-[2%] top-[52%] hidden lg:inline-flex" },
];

export function Problem() {
  return (
    <section className="relative px-5 py-28 sm:px-8 sm:py-36">
      <div className="relative mx-auto max-w-4xl">
        {/* the chaos — paper scraps pinned around the statement */}
        {SCRAPS.map((s, i) => (
          <Reveal
            key={s.label}
            delay={150 + i * 120}
            aria-hidden="true"
            className={`absolute z-10 ${s.className}`}
          >
            <span
              className="scrap inline-block rounded-lg border border-border/60 px-3 py-1.5 font-[family-name:var(--font-pally)] text-[0.82rem] font-medium"
              style={{
                backgroundColor: TINT[s.tint].bg,
                color: TINT[s.tint].ink,
                transform: `rotate(${s.rotate}deg)`,
              }}
            >
              {s.label}
            </span>
          </Reveal>
        ))}

        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[2.2rem] font-bold leading-[1.08] tracking-[-0.025em] text-foreground text-balance sm:text-[3.1rem]">
            Right now your job search lives in{" "}
            <span className="relative inline-block">
              40 tabs
              <Scratch className="absolute -bottom-1 left-0 w-full text-primary opacity-60" />
            </span>
            , three apps, and one{" "}
            <span className="relative inline-block whitespace-nowrap">
              guilty spreadsheet.
              <Scratch className="absolute -bottom-1 left-0 w-full text-primary opacity-60" />
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            None of them talk to each other, and the deadline you cared about is
            in whichever one you didn&apos;t open.
          </p>
        </Reveal>

        {/* mobile chaos — scraps wrap under the heading instead of floating */}
        <div aria-hidden="true" className="mt-6 flex flex-wrap justify-center gap-2 lg:hidden">
          {SCRAPS.map((s) => (
            <span
              key={s.label}
              className="scrap inline-block rounded-lg border border-border/60 px-2.5 py-1 font-[family-name:var(--font-pally)] text-[0.75rem] font-medium"
              style={{
                backgroundColor: TINT[s.tint].bg,
                color: TINT[s.tint].ink,
                transform: `rotate(${s.rotate / 2}deg)`,
              }}
            >
              {s.label}
            </span>
          ))}
        </div>

        {/* the collecting squiggle — draws down into the resolved card */}
        <Reveal delay={120} className="flex justify-center">
          <CollectSquiggle className="mt-2 h-20 w-40 text-primary/50 sm:h-24" />
        </Reveal>

        {/* the fix — one clean card, everything in its place. Decorative:
            the sr-only line carries the message for AT. */}
        <p className="sr-only">
          jobhq resolves all of it into one job card: role, company,
          salary, deadline reminder, saved answers, and a drafted cover letter.
        </p>
        <Reveal delay={200} aria-hidden="true" className="relative z-20 mx-auto mt-2 max-w-md">
          <div className="relative rounded-2xl border border-border bg-card p-4 shadow-[0_30px_60px_-32px_rgba(20,40,25,0.45)]">
            <Sticker tint="fern" rotate={-3} className="absolute -top-4 left-5">
              one card. all of it.
            </Sticker>
            <div className="flex items-start gap-3 pt-2">
              <BrandLogo slug="linear" label="Linear" className="size-9" />
              <div className="min-w-0 flex-1">
                <p className="text-[0.95rem] font-semibold text-foreground">
                  Senior Frontend Engineer
                </p>
                <p className="mt-0.5 text-[0.78rem] text-muted-foreground">
                  Linear · Saved from LinkedIn · $170–210k
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--tint-fern)] px-2.5 py-1 text-[0.68rem] font-semibold text-[var(--tint-fern-ink)]">
                <span className="size-1.5 rounded-full bg-current" /> Applied
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-[0.74rem]">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Icon.Clock className="size-3.5 text-[var(--tint-butter-ink)]" />
                Closes Friday — reminder set
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Icon.Check className="size-3.5 text-primary" />
                6 answers saved
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Icon.Spark className="size-3.5 text-sun" />
                Cover letter drafted
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Icon.Arrow className="size-3.5 text-primary" />
                Next: follow up Tuesday
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** Rough hand-drawn scratch-through line. */
function Scratch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 14" fill="none" aria-hidden className={className}>
      <path
        d="M4 9C40 4 90 3 130 6c30 2 60 3 86-1M14 12c50-4 120-5 190-2"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A loose line that gathers downward — chaos funnelling into the card. */
function CollectSquiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 96" fill="none" aria-hidden className={className}>
      <path
        d="M12 8c30 18 62 14 88 4 22-9 44-6 48 6 4 13-18 16-42 14-30-2-56 6-46 22 8 13 32 14 40 26"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="1 9"
      />
      <path
        d="M92 66c4 6 6 10 8 16M100 82c-6-1-11-1-16 1"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
