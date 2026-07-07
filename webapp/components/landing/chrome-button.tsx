import { cn } from "@/lib/utils";

/* Simplified Chrome mark — three 120° segments (red top, yellow lower-left,
   green lower-right) around the blue disc, correct brand colors. */
function ChromeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 24 6.68 14a20 20 0 0 1 34.64 0Z" />
      <path fill="#34A853" d="M24 24 41.32 14a20 20 0 0 1-17.32 30Z" />
      <path fill="#FBBC05" d="M24 24v20A20 20 0 0 1 6.68 14Z" />
      <circle cx="24" cy="24" r="9.5" fill="#fff" />
      <circle cx="24" cy="24" r="7.5" fill="#4285F4" />
    </svg>
  );
}

type ChromeStoreButtonProps = {
  className?: string;
  size?: "sm" | "default" | "lg";
  label?: string;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

/** Primary conversion CTA — links to the Chrome Web Store listing.
    TODO: swap the default href for the real Web Store URL at publish;
    until then it scrolls to the closing CTA block (#install in closer.tsx). */
export function ChromeStoreButton({
  className,
  size = "default",
  label = "Add to Chrome",
  href = "#install",
  onClick,
}: ChromeStoreButtonProps) {
  const sizes = {
    sm: "h-9 px-4 text-sm gap-1.5",
    default: "h-11 px-5 text-[0.95rem] gap-2",
    lg: "h-13 px-7 text-base gap-2.5",
  } as const;

  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        /* fern-600 fill: --primary + white label is 3.94:1, under AA for
           this label size; fern-600 clears 4.5:1 with the same look. */
        "group inline-flex items-center justify-center rounded-full bg-fern-600 font-semibold text-primary-foreground",
        "shadow-[0_6px_20px_-6px_color-mix(in_oklch,var(--primary)_60%,transparent)] ring-1 ring-inset ring-white/10",
        "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-fern-700 hover:shadow-[0_10px_28px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)]",
        "active:translate-y-0 active:shadow-[0_4px_14px_-6px_color-mix(in_oklch,var(--primary)_60%,transparent)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer",
        sizes[size],
        className,
      )}
    >
      <ChromeMark
        className={cn(
          "transition-transform duration-300 group-hover:rotate-[20deg]",
          size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5",
        )}
      />
      {label}
    </a>
  );
}
