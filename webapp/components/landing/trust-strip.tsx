import { BrandLogo } from "./brand-logo";

const SOURCES = [
  { slug: "linkedin", name: "LinkedIn" },
  { slug: "greenhouse", name: "Greenhouse" },
  { slug: "lever", name: "Lever" },
  { slug: "workday", name: "Workday" },
];

/**
 * Platform row — a clean, calm statement that jobhq works where people
 * already look. Static and uncluttered (no marquee): the four logos sit on one
 * line and wrap to a tidy grid on small screens.
 */
export function TrustStrip() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-14">
        <p className="text-center text-sm font-medium text-muted-foreground">
          Save roles from the places you{" "}
          <span className="font-semibold text-foreground">already search.</span>
        </p>

        <div className="mt-8 grid grid-cols-2 items-center justify-items-center gap-x-6 gap-y-7 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-12">
          {SOURCES.map((s) => (
            <span
              key={s.slug}
              className="inline-flex items-center gap-2.5 whitespace-nowrap text-base font-semibold text-foreground/70 transition-colors hover:text-foreground"
            >
              <BrandLogo slug={s.slug} label={s.name} className="size-7" />
              {s.name}
            </span>
          ))}
          <span className="col-span-2 text-sm font-medium text-muted-foreground sm:col-span-1">
            + anywhere else
          </span>
        </div>
      </div>
    </section>
  );
}
