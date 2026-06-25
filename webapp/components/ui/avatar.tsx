import { cn } from "@/lib/utils"

// Initials avatar — fern-tinted chip. No image dependency; good enough for the
// profile section until real auth/avatars land.
function Avatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary",
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export { Avatar }
