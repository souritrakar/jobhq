import { ChromeStoreButton } from "../chrome-button";
import { Reveal } from "../reveal";
import { Sparkle } from "../scribbles";
import { TINT } from "./bits";

/* The send-off: a scatter of paper scraps from a search that went well, the
   last CTA, then the giant fern wordmark rolling off the page bottom. The
   scraps are gray notes; the two that matter — the interview and the offer —
   get the highlighter and the marker. */

const SCRAPS: {
  label: string;
  tint: keyof typeof TINT;
  rotate: number;
  className: string;
  delay: number;
}[] = [
  { label: "interview @ 2pm", tint: "butter", rotate: -5, className: "left-[6%] top-4 hidden md:inline-flex", delay: 0 },
  { label: "followed up ✓", tint: "neutral", rotate: 3, className: "right-[10%] top-0 hidden md:inline-flex", delay: 120 },
  { label: "referral: Priya", tint: "neutral", rotate: -2, className: "left-[14%] bottom-8 hidden md:inline-flex", delay: 240 },
  { label: "offer!!", tint: "fern", rotate: 4, className: "right-[7%] bottom-14 hidden md:inline-flex", delay: 360 },
  { label: "0 tabs open", tint: "neutral", rotate: -3, className: "left-[4%] top-1/2 hidden lg:inline-flex", delay: 480 },
];

/* One green marker wrote the whole wordmark — the tilt is the play, not the
   color. Letters wobble like they were stamped by hand. */
const LETTERS: { ch: string; rotate: number }[] = [
  { ch: "j", rotate: -2 },
  { ch: "o", rotate: 1.5 },
  { ch: "b", rotate: -1 },
  { ch: "t", rotate: 2 },
  { ch: "r", rotate: -1.5 },
  { ch: "a", rotate: 1 },
  { ch: "c", rotate: -2 },
  { ch: "k", rotate: 1.5 },
  { ch: "e", rotate: -1 },
  { ch: "r", rotate: 2 },
];

export function Closer() {
  return (
    <footer className="relative overflow-hidden pt-24 sm:pt-32">
      {/* ── final CTA with the collage around it ── */}
      <div className="relative mx-auto max-w-4xl px-5 sm:px-8">
        {SCRAPS.map((s) => (
          <Reveal
            key={s.label}
            delay={s.delay}
            className={`absolute z-10 ${s.className}`}
          >
            <span
              className="scrap hover-wobble inline-block rounded-xl border border-border/60 px-3.5 py-2 font-[family-name:var(--font-pally)] text-[0.9rem] font-semibold"
              style={{
                backgroundColor: TINT[s.tint].bg,
                color: TINT[s.tint].ink,
                transform: `rotate(${s.rotate}deg)`,
                ["--pop-rotate" as string]: `${s.rotate}deg`,
              }}
            >
              {s.label}
            </span>
          </Reveal>
        ))}

        {/* #install: landing spot for the "Add to Chrome" CTAs until the real
            Web Store URL is wired into ChromeStoreButton. */}
        <Reveal id="install" className="relative scroll-mt-32 text-center">
          <Sparkle className="absolute -top-8 left-[30%] w-5 text-sun" />
          <h2 className="mx-auto max-w-[16ch] font-display text-[2.2rem] font-bold leading-[1.08] tracking-[-0.025em] text-foreground text-balance sm:text-[3.1rem]">
            Close the tabs. Keep the jobs.
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ChromeStoreButton size="lg" />
            <a
              href="/dashboard"
              className="inline-flex h-13 cursor-pointer items-center justify-center rounded-full border border-border bg-background px-6 text-base font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-secondary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Open the web app
            </a>
          </div>
          <p className="mt-4 text-[0.85rem] text-muted-foreground">
            Takes about 20 seconds. The spreadsheet won&apos;t miss you.
          </p>
        </Reveal>
      </div>

      {/* ── link row ── */}
      <div className="mx-auto mt-20 flex max-w-5xl flex-wrap items-center justify-center gap-x-7 gap-y-2 border-t border-border/70 px-5 pt-8 text-[0.85rem] text-muted-foreground sm:justify-between sm:px-8">
        <span>© 2026 jobhq</span>
        {/* TODO: add a Privacy link back once /privacy exists — it 404'd. */}
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Footer">
          {[
            { href: "#how", label: "How it works" },
            { href: "#extension", label: "Extension" },
            { href: "#app", label: "The app" },
            { href: "#faq", label: "FAQ" },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md py-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>

      {/* ── the giant goodbye ── */}
      <div
        aria-hidden
        className="pointer-events-none mt-10 flex select-none justify-center overflow-hidden leading-none"
      >
        <span className="flex translate-y-[18%] font-[family-name:var(--font-pally)] font-bold tracking-[-0.04em]">
          {LETTERS.map((l, i) => (
            <span
              key={i}
              className="inline-block text-[clamp(3.4rem,12.5vw,11rem)] text-primary"
              style={{ transform: `rotate(${l.rotate}deg)` }}
            >
              {l.ch}
            </span>
          ))}
        </span>
      </div>
    </footer>
  );
}
