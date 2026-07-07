import { BrandLogo } from "../brand-logo";
import { Icon } from "../dashboard-mock";
import { SectionHead } from "./bits";
import { Tile } from "./tile";

/* Bento #1 — the extension. Four tiles, each one demo, zero feature prose. */

const SITES = ["linkedin", "indeed", "wellfound", "greenhouse", "lever", "ashby", "workday", "discord"];

export function BentoExtension() {
  return (
    <section id="extension" className="px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHead
          eyebrow="the extension"
          title={<>Catches jobs where they happen</>}
          intro="It lives in your browser, right on the posting — so saving a job costs one click, not one evening."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          {/* one-click save — wide */}
          <Tile
            tag="one-click save"
            tint="fern"
            title="Any job board. Any careers page."
            blurb="LinkedIn, Indeed, Wellfound, Greenhouse — or that link a friend dropped in Discord."
            className="lg:col-span-4"
          >
            <div className="flex h-full flex-wrap content-center items-center gap-2.5">
              {SITES.map((s, i) => (
                <span
                  key={s}
                  className="hover-wobble rounded-2xl bg-white/80 p-2 shadow-[0_10px_24px_-14px_rgba(20,40,25,0.35)]"
                  style={{ ["--pop-rotate" as string]: `${(i % 3) - 1}deg` }}
                >
                  <BrandLogo slug={s} label={s} className="size-8" />
                </span>
              ))}
              <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[0.76rem] font-semibold text-primary-foreground shadow-[0_10px_24px_-10px_oklch(0.4_0.1_152/0.6)]">
                <Icon.Bookmark className="size-3.5" /> Save
              </span>
            </div>
          </Tile>

          {/* questions captured */}
          <Tile
            tag="auto-capture"
            title="The application form comes too"
            blurb="Every question on the posting is detected and filed with the job."
            className="lg:col-span-2"
            delay={100}
          >
            <div className="space-y-2">
              {[
                "Why do you want to work here? *",
                "Years of React experience *",
                "Portfolio URL",
              ].map((q, i) => (
                <div
                  key={q}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-[0.72rem]"
                >
                  <Icon.Check className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate font-medium text-foreground">{q}</span>
                  {i === 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[0.58rem] font-semibold text-muted-foreground">
                      long answer
                    </span>
                  )}
                </div>
              ))}
              <p className="pt-1 text-center font-[family-name:var(--font-pally)] text-[0.78rem] font-medium text-muted-foreground">
                6 questions captured ↑
              </p>
            </div>
          </Tile>

          {/* autofill — the animated one */}
          <Tile
            tag="autofill"
            tint="butter"
            title="Answer once. Reuse forever."
            blurb="Next application, the extension fills your saved answers back into the live page."
            className="lg:col-span-3"
            delay={150}
          >
            <AutofillDemo />
          </Tile>

          {/* live sync */}
          <Tile
            tag="live sync"
            title="Type there, saved here"
            blurb="Whatever you type into the real form mirrors into your tracker as a draft — even across iframes."
            className="lg:col-span-3"
            delay={220}
          >
            <div className="flex h-full items-center justify-center gap-3 py-2">
              <div className="rounded-xl border border-border bg-background px-3 py-2.5 text-center shadow-sm">
                <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Greenhouse form
                </p>
                <p className="mt-1 text-[0.74rem] font-medium text-foreground">
                  &ldquo;I&apos;ve spent four years…&rdquo;
                </p>
              </div>
              <SyncPulse />
              <div className="rounded-xl border border-primary/25 bg-fern-50 px-3 py-2.5 text-center shadow-sm">
                <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-primary">
                  Your tracker
                </p>
                <p className="mt-1 text-[0.74rem] font-medium text-foreground">
                  Draft saved ✓
                </p>
              </div>
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}

/** A long-answer field typing itself, caret blinking, looping. */
function AutofillDemo() {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/85 p-3.5 shadow-[0_16px_36px_-24px_rgba(20,40,25,0.4)]">
      <p className="text-[0.68rem] font-semibold text-foreground">
        Why do you want to work at Linear? <span className="text-destructive">*</span>
      </p>
      <div className="mt-2 rounded-lg border border-border bg-background px-2.5 py-2 text-[0.72rem] leading-relaxed text-foreground">
        <span
          className="inline-block align-top"
          style={{ animation: "type-reveal 3.6s steps(46, end) infinite" }}
        >
          I&apos;ve followed Linear since the beta — I care about tools that respect
          people&apos;s attention…
        </span>
        <span
          className="ml-0.5 inline-block h-3 w-[2px] translate-y-0.5 bg-primary"
          style={{ animation: "blink-caret 1s step-end infinite" }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[0.68rem] font-semibold text-primary-foreground">
          <Icon.Spark className="size-3" /> Autofill
        </span>
        <span className="text-[0.66rem] font-medium text-muted-foreground">
          6 of 6 matched
        </span>
      </div>
    </div>
  );
}

/** Two arrows pulsing opposite ways — the two-way mirror. */
function SyncPulse() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1" aria-hidden>
      <Icon.Arrow className="size-4 animate-pulse text-primary" />
      <Icon.Arrow className="size-4 -scale-x-100 animate-pulse text-primary [animation-delay:0.6s]" />
    </div>
  );
}
