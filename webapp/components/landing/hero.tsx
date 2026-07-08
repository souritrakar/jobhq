import { ChromeStoreButton } from "./chrome-button";
import { DashboardMock } from "./dashboard-mock";
import { BrandLogo } from "./brand-logo";
import { RotatingWord } from "./rotating-word";
import { Underline, ArrowDoodle, Sparkle } from "./scribbles";

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden bg-[#0b1124] px-5 pt-28 pb-40 sm:px-8 sm:pt-32 sm:pb-52"
    >
      {/* Scenic backdrop — a still, starlit mountain night. The deep navy sky
          fills the top third (light copy reads crisp against it); the snow-capped
          ridge sits mid-hero, and the product shot floats over it like a window
          opened onto the scene. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/landing/scenes/starrynight.png"
        alt=""
        className="pointer-events-none absolute inset-0 -z-20 size-full object-cover object-top"
      />
      {/* Deepen the sky behind the headline for contrast, and melt the foot of
          the scene into the page so the next section starts on clean paper. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[55%] bg-gradient-to-b from-[#080c1f]/75 via-[#080c1f]/25 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-72 bg-gradient-to-b from-transparent to-background" />

      {/* Copy */}
      <div className="relative mx-auto max-w-3xl text-center">
        <h1
          className="animate-fade-up mx-auto max-w-[16ch] font-display text-[2.65rem] font-semibold leading-[1.05] tracking-[-0.025em] text-white text-balance [text-shadow:0_2px_28px_rgba(6,10,26,0.55)] sm:text-[3.9rem]"
          style={{ animationDelay: "0ms" }}
        >
          Never{" "}
          <span className="relative inline-block whitespace-nowrap">
            lose
            <Underline className="absolute -bottom-1 left-0 w-full text-[oklch(0.78_0.15_150)]" />
          </span>{" "}
          a job posting again.
        </h1>

        {/* Grid stack: an invisible sizer paragraph (with the longest rotating
            word baked in) reserves the tallest height at EVERY breakpoint, so
            the live paragraph — whose word swaps each second — can never change
            the block height and shift the product mockup below. The visible word
            still sits inline (caret hugs it, no reserved-width gap). */}
        <div
          className="animate-fade-up mx-auto mt-6 grid max-w-xl"
          style={{ animationDelay: "70ms" }}
        >
          <p
            aria-hidden
            className="invisible col-start-1 row-start-1 text-lg leading-relaxed text-white/70"
          >
            Save any job from a careers page in one click. jobhq captures the
            deadline, tracks every application, and reminds you before it closes.
          </p>
          <p className="col-start-1 row-start-1 text-lg leading-relaxed text-white/70">
            Save any job from{" "}
            <RotatingWord
              words={["LinkedIn", "Indeed", "a careers page", "Wellfound", "a Discord link"]}
              className="font-semibold text-white"
            />{" "}
            in one click. jobhq captures the deadline, tracks every
            application, and reminds you before it closes.
          </p>
        </div>

        <div
          className="animate-fade-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "140ms" }}
        >
          <ChromeStoreButton size="lg" />
          <a
            href="#demo"
            className="inline-flex h-13 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 text-base font-semibold text-white backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/15"
          >
            See how it works
          </a>
        </div>


      </div>

      {/* Product shot — the dashboard, with live status labels floating around it
          so the product feels alive (kept subtle / few, never noisy). */}
      <div
        className="animate-fade-up relative mx-auto mt-20 max-w-5xl sm:mt-24"
        style={{ animationDelay: "300ms" }}
      >
        {/* faint hand-drawn arrow pointing into the board */}
        <ArrowDoodle className="pointer-events-none absolute -left-10 top-16 hidden w-16 -scale-x-100 text-primary/30 lg:block" />
        <Sparkle className="pointer-events-none absolute -right-4 -top-5 hidden w-5 text-sun lg:block" />

        <DashboardMock />

        {/* floating "saved from" toast, top-left */}
        <FloatLabel className="-left-3 top-10 animate-float-slow sm:-left-6 lg:-left-12">
          <BrandLogo slug="linkedin" label="LinkedIn" className="size-4" />
          <span>Saved from LinkedIn</span>
        </FloatLabel>

        {/* floating "deadline found" toast, bottom-right */}
        <FloatLabel className="-right-2 bottom-12 animate-float-slow [animation-delay:1.4s] sm:-right-5 lg:-right-10">
          <span className="size-2 rounded-full bg-amber-500" />
          <span>Deadline found · Friday</span>
        </FloatLabel>
      </div>
    </section>
  );
}

function FloatLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`absolute z-10 hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-foreground shadow-[0_16px_36px_-20px_rgba(20,40,25,0.5)] sm:inline-flex ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 text-[oklch(0.8_0.14_150)]" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
      <path
        d="M6 10.5l2.5 2.5L14 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
