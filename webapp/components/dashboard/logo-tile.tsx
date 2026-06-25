import { Building2 } from "lucide-react"

import { cn } from "@/lib/utils"

// Low-contrast, single-hue tints for the initial tile — a company always lands on the same
// hue, so a long list stays scannable by color, not just text. Kept deliberately muted: the
// tile is wayfinding, not an accent. (Fern is reserved for the brand's real accent moments.)
const TINTS = [
  "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300",
  "bg-sky-500/10 text-sky-700 dark:bg-sky-400/12 dark:text-sky-300",
  "bg-violet-500/10 text-violet-700 dark:bg-violet-400/12 dark:text-violet-300",
  "bg-amber-500/12 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300",
  "bg-rose-500/10 text-rose-700 dark:bg-rose-400/12 dark:text-rose-300",
  "bg-teal-500/10 text-teal-700 dark:bg-teal-400/12 dark:text-teal-300",
]

function tint(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return TINTS[hash % TINTS.length]
}

// A bare domain ("linkedin.com") stuffed into the company field — common for aggregator
// listings — isn't a real company name, so we treat it as unknown.
function isDomainLike(value: string) {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)
}

/** Normalize a raw company field to a usable display name, or `undefined` when there isn't one. */
export function displayCompany(raw?: string | null): string | undefined {
  const c = raw?.trim()
  return c && !isDomainLike(c) ? c : undefined
}

// The company mark: a consistent squircle tile. With a name → tinted initial; without →
// a low-contrast building icon. Fallback lives here so call sites can't render an empty tile.
export function LogoTile({
  company,
  className,
}: {
  company?: string
  className?: string
}) {
  if (!company) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-[30%] bg-muted text-muted-foreground",
          className,
        )}
      >
        <Building2 className="size-[18px]" />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[30%] text-[13px] font-semibold",
        tint(company),
        className,
      )}
    >
      {company.charAt(0).toUpperCase()}
    </span>
  )
}
