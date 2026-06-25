import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

type SectionIntroProps = {
  /** Optional small eyebrow label (plain tracked text — never a chip). */
  eyebrow?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** "center" = editorial centered (aiapply register); "left" = asymmetric. */
  variant?: "center" | "left";
  className?: string;
};

/**
 * Marketing section header. Quiet and minimal — an optional plain tracked
 * eyebrow (no chip, no accent rule) over a semibold display title. Two layouts
 * (centered + left) are mixed across sections for rhythm.
 */
export function SectionIntro({
  eyebrow,
  title,
  children,
  variant = "left",
  className,
}: SectionIntroProps) {
  const centered = variant === "center";

  return (
    <Reveal
      className={cn(
        centered ? "mx-auto max-w-2xl text-center" : "max-w-3xl",
        className,
      )}
    >
      {eyebrow && (
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
      )}

      <h2
        className={cn(
          "font-display font-semibold leading-[1.1] tracking-[-0.02em] text-foreground text-balance",
          "text-[1.95rem] sm:text-[2.5rem]",
        )}
      >
        {title}
      </h2>

      {children && (
        <p
          className={cn(
            "mt-4 text-lg leading-relaxed text-muted-foreground",
            centered ? "mx-auto max-w-xl" : "max-w-2xl",
          )}
        >
          {children}
        </p>
      )}
    </Reveal>
  );
}
