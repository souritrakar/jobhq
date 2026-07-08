import { ChromeStoreButton } from "../chrome-button";
import { RotatingWord } from "../rotating-word";
import { ArrowDoodle, Underline } from "../scribbles";
import { Peep } from "../peep";
import { AppMock } from "./app-mock";
import { ExtensionMock } from "./extension-mock";
import { Hl, Sticker } from "./bits";

/* v5 hero — daylight paper. Headline with a highlighter swipe, then the
   signature shot: the real dashboard in a browser frame with the extension
   drawer physically docked onto its right edge, hand-labelled like a sketch
   in a notebook. Both products, one picture, zero feature prose. */

export function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden px-5 pb-16 pt-32 sm:px-8 sm:pb-24 sm:pt-40">
      {/* paper backdrop — dotted grid fading out, two faint tint pools */}
      <div className="paper-dots pointer-events-none absolute inset-x-0 top-0 -z-20 h-[46rem] [mask-image:radial-gradient(90%_70%_at_50%_18%,black,transparent)]" />
      <div
        className="pointer-events-none absolute -top-24 right-[8%] -z-10 size-96 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--tint-butter), transparent)" }}
      />
      <div
        className="pointer-events-none absolute left-[4%] top-52 -z-10 size-[26rem] rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--tint-fern), transparent)" }}
      />

      {/* ── copy ── */}
      <div className="relative mx-auto max-w-3xl text-center">
        <div className="animate-fade-up flex justify-center" style={{ animationDelay: "0ms" }}>
          <Sticker rotate={-2}>free extension + web app</Sticker>
        </div>

        <h1
          className="animate-fade-up mx-auto mt-6 max-w-[17ch] font-display text-[2.7rem] font-bold leading-[1.04] tracking-[-0.03em] text-foreground text-balance sm:text-[4.1rem]"
          style={{ animationDelay: "70ms" }}
        >
          Never lose a{" "}
          <span className="relative inline-block whitespace-nowrap">
            <Hl>job posting</Hl>
            <Underline className="absolute -bottom-2 left-0 w-full text-primary/60" />
          </span>{" "}
          again.
        </h1>

        {/* Grid stack: an invisible sizer with the longest rotating word baked
            in reserves the block height at every breakpoint, so the live line
            never reflows the CTAs as the word cycles. */}
        <div
          className="animate-fade-up mx-auto mt-7 grid max-w-xl"
          style={{ animationDelay: "140ms" }}
        >
          <p aria-hidden className="invisible col-start-1 row-start-1 text-lg leading-relaxed">
            See a role on a Discord link? One click saves it — deadline, salary,
            application questions and all — into a tracker that actually nags
            you in time.
          </p>
          <p className="col-start-1 row-start-1 text-lg leading-relaxed text-muted-foreground">
            See a role on{" "}
            <RotatingWord
              words={["LinkedIn", "Indeed", "a careers page", "Wellfound", "a Discord link"]}
              className="font-semibold text-foreground"
            />
            ? One click saves it — deadline, salary, application questions and
            all — into a tracker that actually nags you in time.
          </p>
        </div>

        <div
          className="animate-fade-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "210ms" }}
        >
          <ChromeStoreButton size="lg" />
          <a
            href="/dashboard"
            className="inline-flex h-13 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-background px-6 text-base font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-secondary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Open the web app
          </a>
        </div>
        <p
          className="animate-fade-up mt-4 text-[0.85rem] text-muted-foreground"
          style={{ animationDelay: "260ms" }}
        >
          Free · no card · works on every job board
        </p>
      </div>

      {/* ── signature shot ── */}
      <p className="sr-only">
        Illustration: the jobhq dashboard with saved jobs and pipeline
        stats, with the browser-extension drawer docked beside it capturing a
        job posting.
      </p>
      <div
        aria-hidden="true"
        className="animate-fade-up relative mx-auto mt-16 max-w-5xl sm:mt-24"
        style={{ animationDelay: "340ms" }}
      >
        {/* plain paper sheets peeking out behind the browser frame — depth, no color */}
        <div className="scrap absolute -left-6 top-16 -z-10 hidden h-40 w-56 -rotate-6 rounded-2xl border border-border/70 bg-card lg:block" />
        <div className="scrap absolute -right-4 -top-8 -z-10 hidden h-36 w-64 rotate-3 rounded-2xl border border-border/70 bg-card lg:block" />

        {/* hand-written annotations — the green pen (ink shade clears AA) */}
        <div className="pointer-events-none absolute -top-12 left-[17%] z-20 hidden rotate-[-4deg] items-center gap-2 lg:flex">
          <span className="font-[family-name:var(--font-pally)] text-[1.05rem] font-semibold text-[var(--tint-fern-ink)]">
            everything lands here
          </span>
          <ArrowDoodle className="mt-4 w-12 rotate-[30deg] text-primary/50" />
        </div>
        <div className="pointer-events-none absolute -right-2 -top-16 z-20 hidden rotate-[3deg] flex-col items-center gap-1 xl:flex">
          <span className="font-[family-name:var(--font-pally)] text-[1.05rem] font-semibold text-[var(--tint-fern-ink)]">
            the extension catches it
          </span>
          <ArrowDoodle className="w-11 -scale-x-100 rotate-[10deg] text-primary/50" />
        </div>

        {/* the dashboard, leaving air on the right for the docked drawer */}
        <AppMock className="lg:mr-44" />

        {/* the extension drawer docked over the frame's right edge */}
        <div className="absolute -right-1 top-8 z-10 hidden rotate-[1.5deg] md:block lg:right-4">
          <ExtensionMock />
          <Confetti className="absolute -top-3 left-1/2" />
        </div>

        {/* one floating toast — the annotations already tell the save story */}
        <FloatToast className="-left-5 bottom-14 animate-float-slow sm:-left-10">
          <span className="size-2 rounded-full" style={{ backgroundColor: "var(--sun)" }} />
          <span>Deadline found · Friday</span>
        </FloatToast>

        {/* a peep resting on the frame */}
        <Peep
          name="sit"
          className="absolute -top-[4.7rem] right-[30%] hidden w-24 lg:block"
        />
      </div>
    </section>
  );
}

function FloatToast({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`absolute z-20 hidden items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-[0.74rem] font-semibold text-foreground shadow-[0_18px_40px_-20px_rgba(20,40,25,0.45)] sm:inline-flex ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/** Six petals bursting from a point, looping gently. Pure CSS — green + gold only. */
function Confetti({ className }: { className?: string }) {
  const petals = [
    { x: -26, y: -30, c: "var(--tint-fern-ink)", d: 0 },
    { x: 22, y: -34, c: "var(--sun)", d: 0.12 },
    { x: -34, y: -8, c: "var(--primary)", d: 0.24 },
    { x: 34, y: -14, c: "var(--tint-butter-ink)", d: 0.3 },
    { x: -14, y: -40, c: "var(--fern-600)", d: 0.42 },
    { x: 16, y: -24, c: "var(--primary)", d: 0.5 },
  ];
  return (
    <span aria-hidden className={`pointer-events-none ${className ?? ""}`}>
      {petals.map((p, i) => (
        <span
          key={i}
          className="confetti-petal absolute block size-1.5 rounded-[2px]"
          style={{
            backgroundColor: p.c,
            ["--fly-x" as string]: `${p.x}px`,
            ["--fly-y" as string]: `${p.y}px`,
            animation: `confetti-fly 2.6s ease-out ${p.d}s infinite`,
          }}
        />
      ))}
    </span>
  );
}
