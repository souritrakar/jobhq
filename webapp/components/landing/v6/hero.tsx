import { ChromeStoreButton } from "../chrome-button";
import { Reveal } from "../reveal";
import { Hl } from "./bits";
import { MockDashboard } from "./mock-dashboard";

/* Hero: centered value prop over one big believable product window, still and
   unannotated (the Circleback register: the window IS the argument). Max 4
   text elements: headline, subtext, CTAs. */

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-5 pb-10 pt-32 sm:pt-36">
      {/* Soft sky: barely-tinted fern wash + paper dots, fading out mid-hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] [background:radial-gradient(90%_70%_at_50%_0%,color-mix(in_oklch,var(--stage-sage-soft)_75%,white)_0%,transparent_100%)]"
      />
      <div aria-hidden className="paper-dots pointer-events-none absolute inset-x-0 top-0 h-[480px] opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <div className="relative mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-[2.6rem] font-black leading-[1.04] tracking-[-0.03em] text-foreground text-balance sm:text-6xl">
            Never lose a{" "}
            <span className="whitespace-nowrap">
              <Hl>job posting</Hl>
            </span>{" "}
            again.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            One click saves the role, deadline, and application questions.
            jobhq remembers everything and nags you before it matters.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <ChromeStoreButton size="lg" />
            <a
              href="/dashboard"
              className="inline-flex h-13 items-center rounded-full border border-border bg-background px-7 text-base font-semibold text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-secondary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Open the web app
            </a>
          </div>
        </Reveal>

        {/* Product stage: one still window, nothing floating over it */}
        <Reveal delay={140} className="relative mx-auto mt-14 max-w-5xl sm:mt-16">
          <MockDashboard />
        </Reveal>
      </div>
    </section>
  );
}
