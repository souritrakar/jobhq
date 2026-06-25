import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Hide the wordmark, show only the mark. */
  markOnly?: boolean;
  /** Light wordmark for dark backgrounds (e.g. over the hero sky at the top of the page). */
  light?: boolean;
};

/**
 * JobTracker brand lockup — a bookmark (save) cradling a sprout leaf (grow),
 * paired with the wordmark.
 */
export function Logo({ className, markOnly = false, light = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid size-8 place-items-center rounded-[0.6rem] bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden>
          <path
            d="M6 4.5h12a1 1 0 0 1 1 1V20l-7-3.6L5 20V5.5a1 1 0 0 1 1-1Z"
            fill="currentColor"
            opacity="0.25"
          />
          <path
            d="M12 13.5c0-2.2.9-4 2.6-5.2M12 13.5c0-1.8-.7-3.3-2.2-4.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M14.8 6.6c1.2-.2 2.1.1 2.6.9.2 1-.2 1.9-1.2 2.4-1 .3-1.9 0-2.5-.8.1-1.1.5-2 1.1-2.5ZM9.3 8c-1.1-.4-2-.2-2.6.5-.4.9-.1 1.9.8 2.5 1 .4 1.9.3 2.6-.4 0-1.1-.3-2-.8-2.6Z"
            fill="currentColor"
          />
        </svg>
      </span>
      {!markOnly && (
        <span
          className={cn(
            "font-heading text-lg font-semibold tracking-tight",
            light ? "text-white" : "text-foreground",
          )}
        >
          Job<span className={light ? "text-[oklch(0.82_0.14_150)]" : "text-primary"}>Tracker</span>
        </span>
      )}
    </span>
  );
}
