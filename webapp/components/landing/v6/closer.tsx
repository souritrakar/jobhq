import { ChromeStoreButton } from "../chrome-button";
import { Reveal } from "../reveal";

/* The send-off: one deep-pine poster block with the last CTA. */

export function Closer() {
  return (
    <footer className="px-5 pb-8">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-2xl text-center [background:radial-gradient(90%_75%_at_14%_0%,oklch(0.52_0.12_156/0.75)_0%,transparent_60%),radial-gradient(80%_85%_at_100%_105%,oklch(0.6_0.13_150/0.5)_0%,transparent_58%),linear-gradient(158deg,oklch(0.32_0.06_158),oklch(0.24_0.05_161))]">
          <div id="install" className="scroll-mt-32 px-6 pb-16 pt-16 sm:pb-20 sm:pt-20">
            <h2 className="mx-auto max-w-[16ch] font-display text-[2.2rem] font-bold leading-[1.08] tracking-[-0.025em] text-white text-balance sm:text-[3.1rem]">
              Close the tabs. Keep the jobs.
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ChromeStoreButton
                size="lg"
                className="bg-white text-[color:var(--pine)] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] ring-0 hover:bg-white/90"
              />
              <a
                href="/dashboard"
                className="inline-flex h-13 cursor-pointer items-center justify-center rounded-full border border-white/25 px-7 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              >
                Open the web app
              </a>
            </div>
            <p className="mt-4 text-[0.85rem] text-white/60">
              Takes about 20 seconds. The spreadsheet won&apos;t miss you.
            </p>
          </div>
        </div>
      </Reveal>

      {/* link row */}
      <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center justify-center gap-x-7 gap-y-2 px-2 text-[0.85rem] text-muted-foreground sm:justify-between">
        <span>© 2026 jobhq</span>
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
    </footer>
  );
}
