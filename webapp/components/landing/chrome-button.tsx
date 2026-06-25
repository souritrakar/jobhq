import { cn } from "@/lib/utils";

function ChromeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="9" fill="#fff" />
      <path fill="#EA4335" d="M24 15h17.3A24 24 0 0 0 4.6 13.4L13 28l.1-.2A11 11 0 0 1 24 15Z" />
      <path fill="#34A853" d="M24 33a9 9 0 0 1-7.8-4.5L4.6 13.4A24 24 0 0 0 19.6 47l5.6-15.2A9 9 0 0 1 24 33Z" />
      <path fill="#FBBC05" d="M33 24a9 9 0 0 1-13.4 7.8L19.6 47A24 24 0 0 0 43 19H24a9 9 0 0 1 9 5Z" opacity="0" />
      <path fill="#4285F4" d="M41.3 15H24a9 9 0 0 1 7.8 13.5L26.2 43h.1A24 24 0 0 0 41.3 15Z" />
      <path fill="#FBBC05" d="M16.2 28.5 4.6 13.4a24 24 0 0 0 15 33.6l5.6-15.2a9 9 0 0 1-9-3.3Z" opacity="0" />
    </svg>
  );
}

type ChromeStoreButtonProps = {
  className?: string;
  size?: "sm" | "default" | "lg";
  label?: string;
  href?: string;
};

/** Primary conversion CTA — links to the Chrome Web Store listing. */
export function ChromeStoreButton({
  className,
  size = "default",
  label = "Add to Chrome",
  href = "#install",
}: ChromeStoreButtonProps) {
  const sizes = {
    sm: "h-9 px-4 text-sm gap-1.5",
    default: "h-11 px-5 text-[0.95rem] gap-2",
    lg: "h-13 px-7 text-base gap-2.5",
  } as const;

  return (
    <a
      href={href}
      className={cn(
        "group inline-flex items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground",
        "shadow-[0_6px_20px_-6px_oklch(0.58_0.13_150/0.6)] ring-1 ring-inset ring-white/10",
        "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-fern-600 hover:shadow-[0_10px_28px_-8px_oklch(0.58_0.13_150/0.7)]",
        "active:translate-y-0 active:shadow-[0_4px_14px_-6px_oklch(0.58_0.13_150/0.6)]",
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
