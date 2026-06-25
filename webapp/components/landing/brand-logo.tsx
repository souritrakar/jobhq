import { cn } from "@/lib/utils";

/* Real brand logos (square "icon" marks) fetched from the context.dev Logo API
   into /public/landing/logos. Rendered as clean, favicon-style rounded chips —
   the simplify.jobs register. Falls back to a monogram if a slug is missing. */

export const BRAND_LOGOS: Record<string, string> = {
  linkedin: "/landing/logos/linkedin.jpg",
  indeed: "/landing/logos/indeed.png",
  greenhouse: "/landing/logos/greenhouse.png",
  lever: "/landing/logos/lever.png",
  ashby: "/landing/logos/ashby.png",
  workday: "/landing/logos/workday.png",
  wellfound: "/landing/logos/wellfound.png",
  discord: "/landing/logos/discord.jpg",
  linear: "/landing/logos/linear.png",
  vercel: "/landing/logos/vercel.png",
  notion: "/landing/logos/notion.svg",
  figma: "/landing/logos/figma.png",
  stripe: "/landing/logos/stripe.svg",
  ramp: "/landing/logos/ramp.jpg",
};

export function BrandLogo({
  slug,
  label,
  className,
}: {
  slug: string;
  label?: string;
  className?: string;
}) {
  const src = BRAND_LOGOS[slug.toLowerCase()];
  if (!src) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-[28%] bg-pine text-[0.6rem] font-bold text-white",
          className,
        )}
      >
        {(label ?? slug)[0]?.toUpperCase()}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "block shrink-0 overflow-hidden rounded-[28%] border border-black/5 bg-white",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label ? `${label} logo` : ""}
        aria-hidden={!label}
        loading="lazy"
        className="size-full object-cover"
      />
    </span>
  );
}
