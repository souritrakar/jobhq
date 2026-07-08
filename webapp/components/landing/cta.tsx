import { ChromeStoreButton } from "./chrome-button";
import { Reveal } from "./reveal";
import { BrandLogo } from "./brand-logo";
import { Underline } from "./scribbles";

const ROW = ["linkedin", "greenhouse", "lever", "notion", "figma", "stripe"];

export function Cta() {
  return (
    <section id="install" className="scroll-mt-20 px-5 py-24 sm:px-8">
      <Reveal>
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2.25rem] bg-pine px-6 py-16 text-center shadow-[0_30px_70px_-50px_rgba(20,40,25,0.6)] sm:px-12 sm:py-20">
          {/* abstract topographic contour pattern — crisp, on-theme texture */}
          <TopoLines className="pointer-events-none absolute inset-0 h-full w-full text-fern-100/20 [mask-image:radial-gradient(120%_120%_at_50%_0%,black,transparent_75%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(60%_100%_at_50%_0%,oklch(0.52_0.08_158/0.45),transparent)]" />

          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-display text-[2.1rem] font-semibold leading-[1.1] tracking-[-0.02em] text-white text-balance sm:text-[3rem]">
              Stop losing jobs in a sea of{" "}
              <span className="relative inline-block whitespace-nowrap">
                open tabs.
                <Underline className="absolute -bottom-1.5 left-0 w-full text-sun" />
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-fern-100/80">
              Install the extension, save the next job you find, and let
              jobhq handle the rest. Free, forever, for the basics.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ChromeStoreButton size="lg" />
              <span className="text-sm text-fern-100/70">
                No account needed
              </span>
            </div>

            {/* live logo row — reinforces "works on every board" */}
            <div className="mt-12 flex items-center justify-center gap-3 opacity-90">
              {ROW.map((slug) => (
                <BrandLogo
                  key={slug}
                  slug={slug}
                  className="size-9 ring-1 ring-white/10 transition-transform hover:-translate-y-0.5"
                />
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** Hand-authored topographic contour lines — abstract landscape texture. */
function TopoLines({ className }: { className?: string }) {
  const lines = Array.from({ length: 9 }, (_, i) => 30 + i * 42);
  return (
    <svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        {lines.map((y, i) => (
          <path
            key={y}
            d={`M-60 ${y} C 180 ${y - 26 - (i % 3) * 6}, 360 ${y + 30}, 600 ${y} S 1020 ${y - 30}, 1260 ${y + 8}`}
          />
        ))}
      </g>
    </svg>
  );
}
