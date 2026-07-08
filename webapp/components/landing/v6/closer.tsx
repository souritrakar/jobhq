import { ChromeStoreButton } from "../chrome-button";
import { Reveal } from "../reveal";

/* The send-off: one deep-evergreen poster block with the last CTA.
   Background is a single same-hue lightness ramp (fern-700 → pine, hues
   160–162), no glow blobs — the Linear register: the color IS the surface. */

export function Closer() {
  return (
    <footer className="px-5 pb-8">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-2xl text-center [background:linear-gradient(160deg,var(--fern-700),var(--pine))]">
          <div id="install" className="scroll-mt-32 px-6 pb-16 pt-16 sm:pb-20 sm:pt-20">
            <h2 className="mx-auto max-w-[16ch] font-display text-[2.2rem] font-bold leading-[1.08] tracking-[-0.025em] text-white text-balance sm:text-[3.1rem]">
              Close the tabs. Keep the jobs.
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ChromeStoreButton
                size="lg"
                className="bg-white text-[color:var(--pine)] shadow-none ring-0 hover:bg-white/90 hover:shadow-none active:shadow-none"
              />
              <a
                href="/dashboard"
                className="inline-flex h-13 cursor-pointer items-center justify-center rounded-full border border-white/25 px-7 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              >
                Open the web app
              </a>
            </div>
            <p className="mt-4 text-[0.85rem] text-white/60">
              Free while in beta. Installing takes about 20 seconds.
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
