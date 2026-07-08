import { BrandLogo } from "../brand-logo";

/* "Works wherever the jobs are" logo marquee (the page's single marquee). */

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

export function Sources() {
  return (
    <section className="px-0 pb-20 pt-14 sm:pb-24">
      <p className="px-5 text-center text-sm font-semibold text-muted-foreground">
        Works wherever the jobs are
      </p>
      <div className="marquee-mask pause-on-hover mt-6 overflow-hidden">
        <div className="marquee-track items-center gap-11 pr-11">
          {[...SITES, ...SITES].map((site, i) => (
            <span
              key={`${site.slug}-${i}`}
              aria-hidden={i >= SITES.length || undefined}
              className="flex shrink-0 items-center gap-2.5"
            >
              <BrandLogo slug={site.slug} label={site.name} className="size-7" />
              <span className="whitespace-nowrap text-[0.95rem] font-semibold text-foreground/70">
                {site.name}
              </span>
            </span>
          ))}
        </div>
      </div>
      <p className="mt-6 px-5 text-center text-[0.85rem] text-muted-foreground">
        ...and any other page with a job on it. If it renders, it saves.
      </p>
    </section>
  );
}
