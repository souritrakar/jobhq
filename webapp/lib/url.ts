// Derive a clean, human-readable site name from a posting URL's domain. We don't
// capture og:site_name yet, so this is a deterministic fallback: take the
// second-level domain (the brand-ish token for typical job/ATS URLs) and title-case it.
//
//   https://boards.greenhouse.io/acme/jobs/123 → "Greenhouse"
//   https://jobs.lever.co/acme                  → "Lever"
//   https://linear.app/careers                  → "Linear"
//   https://www.notion.so/careers               → "Notion"
export function siteNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }

  const parts = host.replace(/^www\./, "").split(".").filter(Boolean)
  if (parts.length === 0) return null

  // Second-level domain: "greenhouse" in boards.greenhouse.io, "lever" in jobs.lever.co.
  const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0]

  // Title-case, splitting hyphenated domains into words ("smart-recruiters" → "Smart Recruiters").
  return sld
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}
