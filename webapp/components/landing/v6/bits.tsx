import { cn } from "@/lib/utils";

/* Shared v6 pieces. Voice rules for the page:
   - Fern is the ONLY accent (CTAs, links, checkmarks).
   - Stage tints (peri / apricot / sage) are BACKGROUNDS for feature blocks,
     never button or link colors.
   - Pally appears only as handwritten annotations and the giant closer
     wordmark, never as body copy or headings.
   - Max 2 colored sentence-case labels (Todoist-style) on the whole page:
     the extension block and the app block. No other section gets an eyebrow. */

export type StageName = "peri" | "apricot" | "sage";

export const STAGE: Record<
  StageName,
  { block: string; soft: string; ink: string }
> = {
  peri: {
    block: "var(--stage-peri)",
    soft: "var(--stage-peri-soft)",
    ink: "var(--stage-peri-ink)",
  },
  apricot: {
    block: "var(--stage-apricot)",
    soft: "var(--stage-apricot-soft)",
    ink: "var(--stage-apricot-ink)",
  },
  sage: {
    block: "var(--stage-sage)",
    soft: "var(--stage-sage-soft)",
    ink: "var(--stage-sage-ink)",
  },
};

/** Highlighter swipe over one key word in a headline. Apricot by default. */
export function Hl({
  children,
  color = "var(--hl-apricot)",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span className="hl" style={{ ["--hl" as string]: color }}>
      {children}
    </span>
  );
}

/** Todoist-style colored sentence-case section label. Budget: 2 per page. */
export function SectionLabel({
  children,
  ink,
  className,
}: {
  children: React.ReactNode;
  ink: string;
  className?: string;
}) {
  return (
    <p
      className={cn("text-[0.95rem] font-bold", className)}
      style={{ color: ink }}
    >
      {children}
    </p>
  );
}

/** Handwritten Pally annotation, optionally with a hand-drawn arrow. */
export function Note({
  children,
  className,
  rotate = -2,
}: {
  children: React.ReactNode;
  className?: string;
  rotate?: number;
}) {
  return (
    <span
      className={cn(
        "inline-block font-[family-name:var(--font-pally)] text-[1rem] font-semibold leading-snug text-foreground/75",
        className,
      )}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </span>
  );
}

/** Short curved hand-drawn arrow (stroke inherits currentColor). */
export function ArrowDoodle({
  className,
  flip = false,
}: {
  className?: string;
  flip?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 44"
      fill="none"
      aria-hidden
      className={cn("text-foreground/45", className)}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <path
        d="M4 6c14 22 34 32 52 30"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M48 30l9 6-11 3"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** macOS-style window chrome that stages every product mockup. */
export function Window({
  children,
  url,
  className,
  shadow = "lg",
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
  shadow?: "lg" | "md";
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-black/[0.07] bg-white text-left",
        shadow === "lg"
          ? "shadow-[0_1px_2px_rgba(15,30,20,0.04),0_20px_50px_-24px_rgba(15,30,20,0.25)]"
          : "shadow-[0_1px_2px_rgba(15,30,20,0.04),0_14px_36px_-20px_rgba(15,30,20,0.22)]",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-2 border-b border-black/[0.06] bg-[oklch(0.985_0.002_150)] px-3.5">
        <span className="flex gap-1.5" aria-hidden>
          <i className="size-2.5 rounded-full bg-[#f6635a]" />
          <i className="size-2.5 rounded-full bg-[#f5bf4f]" />
          <i className="size-2.5 rounded-full bg-[#61c455]" />
        </span>
        {url && (
          <span className="mx-auto flex h-5.5 items-center gap-1.5 rounded-full bg-black/[0.045] px-3 text-[0.68rem] font-medium text-foreground/55">
            <svg viewBox="0 0 12 12" className="size-2.5" fill="none" aria-hidden>
              <rect x="2" y="5" width="8" height="6" rx="1.2" fill="currentColor" opacity=".55" />
              <path d="M4 5V3.8a2 2 0 1 1 4 0V5" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            {url}
          </span>
        )}
        {url && <span className="w-10" aria-hidden />}
      </div>
      {children}
    </div>
  );
}

/** Small round company-logo chip used inside mockups (real logo files). */
export function LogoChip({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block shrink-0 overflow-hidden rounded-[30%] border border-black/[0.06] bg-white",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/landing/logos/${slug === "linkedin" || slug === "ramp" || slug === "discord" ? `${slug}.jpg` : slug === "notion" || slug === "stripe" ? `${slug}.svg` : `${slug}.png`}`}
        alt=""
        aria-hidden
        loading="lazy"
        className="size-full object-cover"
      />
    </span>
  );
}
