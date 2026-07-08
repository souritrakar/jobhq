import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize a free-text salary into a clean, comma-grouped number form while preserving the
 * surrounding text (currency symbols, ranges, "per year", etc). Handles the shorthand a user
 * types by hand: "28K" → "28,000", "28.5K" → "28,500", ".5K" → "500", "1.2M" → "1,200,000",
 * and adds thousands separators to bare numbers ("80000" → "80,000"). Non-numeric tokens
 * ("Competitive", "USD", "-") pass through untouched, so ranges like "$50k-$60k/yr" become
 * "$50,000-$60,000/yr". Anything the regex can't parse is left exactly as the user wrote it.
 */
export function formatSalary(raw: string | null | undefined): string {
  if (!raw) return ""
  // A numeric run — "1,234.5" | "28" | ".5" — optionally followed by a K/M multiplier that must
  // sit on a word boundary so "kids"/"monthly" don't get mistaken for a thousands suffix.
  return raw.replace(
    /(\d[\d,]*(?:\.\d+)?|\.\d+)(?:\s*([kKmM])\b)?/g,
    (match, numStr: string, suffix: string | undefined) => {
      const value = parseFloat(numStr.replace(/,/g, ""))
      if (!Number.isFinite(value)) return match
      if (suffix) {
        const scaled = value * (suffix.toLowerCase() === "k" ? 1_000 : 1_000_000)
        return Math.round(scaled).toLocaleString("en-US")
      }
      return value.toLocaleString("en-US", { maximumFractionDigits: 2 })
    },
  )
}
