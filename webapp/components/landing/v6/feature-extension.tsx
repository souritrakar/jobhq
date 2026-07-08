import { Bookmark, Check } from "lucide-react";
import { Reveal } from "../reveal";
import { LogoChip, SectionLabel, Window } from "./bits";
import { MockPopup } from "./mock-popup";

/* Extension feature: a full-bleed periwinkle stage (Circleback register).
   Text column left; a believable job-posting browser window bleeding off the
   right edge with the save popup overlaid on top of it, filled from the page
   it sits on. Everything still: no pulses, no floating badges. */

function MockPosting({ className = "w-[560px] max-w-none" }: { className?: string }) {
  return (
    <Window url="linkedin.com/jobs" shadow="md" className={className}>
      <div className="bg-white px-6 pb-5 pt-5">
        <div className="flex items-start gap-3.5">
          <LogoChip slug="linear" className="size-11" />
          <div className="min-w-0">
            <h4 className="text-[1.05rem] font-semibold tracking-tight text-foreground">
              Senior Frontend Engineer
            </h4>
            <p className="mt-0.5 text-[0.76rem] text-foreground/55">
              Linear · Remote, North America · Posted 2 days ago
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="flex h-8 items-center rounded-full bg-[#0a66c2] px-4 text-[0.74rem] font-semibold text-white">
            Apply
          </span>
          {/* The injected save button */}
          <span className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-[0.74rem] font-semibold text-primary-foreground">
            <Bookmark className="size-3.5" strokeWidth={2.4} aria-hidden />
            Save
          </span>
          <span className="text-[0.68rem] text-foreground/40">
            added by the extension
          </span>
        </div>

        <div className="mt-5 space-y-2 text-[0.74rem] leading-relaxed text-foreground/60">
          <p className="font-semibold text-foreground/80">About the role</p>
          <p>
            We&apos;re looking for a senior frontend engineer to own core
            product surfaces. You&apos;ll work in a small team shipping weekly,
            with a deep care for craft and performance.
          </p>
          <p>
            You&apos;ll partner closely with design, own features end to end,
            and help set the bar for interface quality across the product.
          </p>
          <p>
            Our stack is TypeScript, React, and a design system we treat as a
            product of its own. You&apos;ll ship to everyone who uses Linear.
          </p>
        </div>
      </div>
    </Window>
  );
}

export function FeatureExtension() {
  return (
    <section id="extension" className="scroll-mt-24 px-5 pb-7">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-2xl [background:var(--stage-peri)]">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {/* Copy */}
            <div className="px-8 pb-4 pt-10 sm:px-12 sm:pt-14 lg:pb-14">
              <SectionLabel ink="var(--stage-peri-ink)">The extension</SectionLabel>
              <h2 className="mt-2.5 font-display text-[1.8rem] font-bold leading-[1.1] tracking-[-0.025em] text-foreground sm:text-[2.3rem]">
                Catches jobs where they happen
              </h2>
              <p className="mt-4 max-w-md text-[0.98rem] leading-relaxed text-foreground/70">
                It lives in your browser, right on the posting. LinkedIn, a
                Greenhouse form, a careers page, a link a friend dropped in
                Discord. One click files the whole thing.
              </p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {[
                  "Title, salary, location, deadline: auto-filled",
                  "Application questions captured with the job",
                  "Status set as you save, synced to the board",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[0.9rem] font-medium text-foreground/80">
                    <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-white/70 text-[color:var(--stage-peri-ink)]">
                      <Check className="size-3" strokeWidth={3} aria-hidden />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {/* Mock stage: posting window bleeding off the right edge, with
                the save popup overlaid, filled from the page beneath it */}
            <div className="relative hidden min-h-[470px] lg:block">
              <div className="absolute -right-14 top-10">
                <MockPosting className="w-[640px] max-w-none" />
              </div>
              {/* Chrome extension popups open below the toolbar, top-right */}
              <div className="absolute right-6 top-16 z-10">
                <MockPopup />
              </div>
            </div>

            {/* Mobile mock */}
            <div className="flex flex-col gap-4 px-6 pb-8 lg:hidden">
              <MockPosting className="w-full" />
              <MockPopup className="w-full max-w-[320px] self-center" />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
