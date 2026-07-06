import { BrandLogo } from "../brand-logo";

/* "Works wherever the jobs are" — logo chips drifting along a hand-drawn
   shelf line. Marquee pauses on hover; masked at the edges. */

const SITES = [
  { slug: "linkedin", name: "LinkedIn" },
  { slug: "indeed", name: "Indeed" },
  { slug: "wellfound", name: "Wellfound" },
  { slug: "greenhouse", name: "Greenhouse" },
  { slug: "lever", name: "Lever" },
  { slug: "ashby", name: "Ashby" },
  { slug: "workday", name: "Workday" },
  { slug: "discord", name: "Discord links" },
];

export function Shelf() {
  return (
    <section className="px-0 py-16 sm:py-20">
      <p className="px-5 text-center font-[family-name:var(--font-pally)] text-[1.05rem] font-semibold text-muted-foreground">
        works wherever the jobs are
      </p>

      <div className="marquee-mask pause-on-hover mt-7 overflow-hidden">
        <div className="marquee-track items-center gap-10 pr-10">
          {[...SITES, ...SITES].map((site, i) => (
            <span key={`${site.slug}-${i}`} className="flex shrink-0 items-center gap-2.5">
              <BrandLogo slug={site.slug} label={site.name} className="size-7" />
              <span className="whitespace-nowrap text-[0.95rem] font-semibold text-foreground/70">
                {site.name}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* the shelf — one long wavy stroke */}
      <svg
        viewBox="0 0 1200 24"
        preserveAspectRatio="none"
        aria-hidden
        className="mx-auto mt-6 h-4 w-full max-w-5xl px-5 text-primary/35"
      >
        <path
          d="M4 14C120 6 260 18 400 12S680 4 820 12s260 8 376-2"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      <p className="mt-5 px-5 text-center text-[0.85rem] text-muted-foreground">
        …and any other page with a job on it. If it renders, it saves.
      </p>
    </section>
  );
}
