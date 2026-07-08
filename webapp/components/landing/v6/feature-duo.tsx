import { Check } from "lucide-react";
import { Reveal } from "../reveal";

/* Two half-width stages under the extension block: apricot (questions
   captured) and sage (autofill). Each holds a small believable panel in the
   Circleback register: plain rows, gray meta, no per-row borders. */

function MockQuestions() {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,30,20,0.04),0_16px_36px_-18px_rgba(15,30,20,0.28)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.74rem] font-semibold text-foreground">
          Application questions
        </p>
        <span className="text-[0.64rem] text-foreground/45">6 found on this page</span>
      </div>
      <ul className="mt-2.5 flex flex-col gap-2">
        {[
          { q: "Why do you want to work here?", tag: "long answer" },
          { q: "Years of React experience", tag: "number" },
          { q: "Portfolio URL", tag: "link" },
          { q: "Are you authorized to work in the US?", tag: "yes / no" },
        ].map((item) => (
          <li key={item.q} className="flex items-center gap-2.5">
            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-[color:var(--tint-fern)] text-[color:var(--tint-fern-ink)]">
              <Check className="size-2.5" strokeWidth={3.2} aria-hidden />
            </span>
            <span className="min-w-0 truncate text-[0.74rem] text-foreground">
              {item.q}
            </span>
            <span className="ml-auto shrink-0 text-[0.62rem] text-foreground/40">
              {item.tag}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[0.64rem] text-foreground/35">Show 2 more...</p>
    </div>
  );
}

function MockAutofill() {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,30,20,0.04),0_16px_36px_-18px_rgba(15,30,20,0.28)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.74rem] font-semibold text-foreground">
          Why do you want to work at Linear?
          <span className="ml-1 text-[color:var(--destructive)]">*</span>
        </p>
        <span className="shrink-0 text-[0.62rem] text-foreground/40">6 of 6 matched</span>
      </div>
      <div className="mt-2.5 rounded-lg border border-black/[0.08] bg-[oklch(0.99_0.001_150)] px-3 py-2.5">
        <p className="text-[0.74rem] leading-relaxed text-foreground/85">
          I&apos;ve followed Linear since the beta. The way the team treats
          quality as a feature is exactly how I like to build.
        </p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex h-7.5 items-center rounded-md bg-primary px-3 text-[0.7rem] font-semibold text-primary-foreground">
          Autofill
        </span>
        <span className="text-[0.66rem] text-foreground/45">
          filled from your saved answers
        </span>
      </div>
    </div>
  );
}

export function FeatureDuo() {
  return (
    <section className="px-5 pb-7">
      <div className="mx-auto grid max-w-6xl gap-7 lg:grid-cols-2">
        <Reveal className="min-w-0">
          <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl px-8 pb-9 pt-9 [background:var(--stage-apricot)] sm:px-10 sm:pt-11">
            <h2 className="font-display text-[1.45rem] font-bold leading-[1.12] tracking-[-0.02em] text-foreground sm:text-[1.7rem]">
              Every question, captured
            </h2>
            <p className="mt-3 max-w-sm text-[0.94rem] leading-relaxed text-foreground/70">
              The application form is detected and filed with the job, before
              you close the tab.
            </p>
            <div className="mt-7">
              <MockQuestions />
            </div>
          </div>
        </Reveal>

        <Reveal delay={110} className="min-w-0">
          <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl px-8 pb-9 pt-9 [background:var(--stage-sage)] sm:px-10 sm:pt-11">
            <h2 className="font-display text-[1.45rem] font-bold leading-[1.12] tracking-[-0.02em] text-foreground sm:text-[1.7rem]">
              Answer once, reuse forever
            </h2>
            <p className="mt-3 max-w-sm text-[0.94rem] leading-relaxed text-foreground/70">
              On the next application, the extension fills your saved answers
              back into the live page.
            </p>
            <div className="mt-auto pt-7">
              <MockAutofill />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
