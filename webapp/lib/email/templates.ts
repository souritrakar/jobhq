import { env } from "@/lib/env"

// Table-based, inline-styled HTML so it renders in every mail client. Warm-paper/Fern identity. A
// single `shell()` wraps each body with a heading + a CTA button.
//
// Untrusted input note: `heading` is the reminder title (user-controlled) and the body can carry
// scraped company/role names, so every interpolation here is escaped. `bodyHtml` is the ONE
// exception — callers pass already-escaped HTML (so they can introduce intentional <br> markup).
function shell(heading: string, bodyHtml: string, cta: { label: string; href: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:14px;padding:28px">
      <tr><td style="font-size:18px;font-weight:700;padding-bottom:12px">${escapeHtml(heading)}</td></tr>
      <tr><td style="font-size:14px;line-height:1.6;color:#444">${bodyHtml}</td></tr>
      <tr><td style="padding-top:20px">
        <a href="${safeUrl(cta.href)}" style="background:#3f9b6a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:9px;display:inline-block;font-size:14px;font-weight:600">${escapeHtml(cta.label)}</a>
      </td></tr>
      <tr><td style="padding-top:24px;font-size:11px;color:#999">JobTracker. Manage reminders in your dashboard settings.</td></tr>
    </table>
  </td></tr></table></body></html>`
}

// Reminder email has its own quiet, single-purpose layout (not the generic `shell`) so the
// typography hierarchy is intentional: a small eyebrow, the reminder text as the headline, an
// optional muted "Role @ Company" line, the CTA, then a one-line context note. Kept deliberately
// sparse so it reads as a clean nudge rather than a marketing blast. `where` is user/scraped data
// and is escaped; the eyebrow/note are static literals.
export function reminderEmail(copy: { title: string; where: string | null }, href: string): string {
  const whereRow = copy.where
    ? `<tr><td style="font-size:15px;line-height:1.5;color:#6f6f6f;padding-top:8px">${escapeHtml(copy.where)}</td></tr>`
    : ""
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;padding:36px">
      <tr><td style="font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#3f9b6a;padding-bottom:14px">Reminder</td></tr>
      <tr><td style="font-size:23px;font-weight:700;line-height:1.35;color:#1f1f1f">${escapeHtml(copy.title)}</td></tr>
      ${whereRow}
      <tr><td style="padding-top:30px">
        <a href="${safeUrl(href)}" style="background:#3f9b6a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;font-size:15px;font-weight:600">View in JobTracker</a>
      </td></tr>
      <tr><td style="padding-top:30px;font-size:12px;line-height:1.5;color:#a0a0a0">You're getting this because you set a reminder in JobTracker.</td></tr>
    </table>
  </td></tr></table></body></html>`
}

// The digest gets its own layout (not the generic `shell`) so each stale role reads as a scannable
// card with a clear two-level hierarchy: the role title as the primary line, the company muted
// beneath it, and a Fern accent bar tying the list to the brand. `title`/`intro` are static-ish
// copy; every `job` field is scraped/user data and is escaped before interpolation.
export function digestEmail(
  copy: { title: string; intro: string },
  jobs: { title: string; company: string }[],
  moreCount: number,
  href: string,
): string {
  const cards = jobs
    .map(
      (j) => `
      <tr><td style="padding-bottom:10px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f3;border-radius:10px">
          <tr><td style="padding:13px 16px;border-left:3px solid #3f9b6a;border-radius:10px 0 0 10px">
            <div style="font-size:15px;font-weight:600;line-height:1.4;color:#1f1f1f">${escapeHtml(j.title)}</div>
            <div style="font-size:13px;line-height:1.4;color:#8a8a8a;padding-top:3px">${escapeHtml(j.company)}</div>
          </td></tr>
        </table>
      </td></tr>`,
    )
    .join("")
  const moreRow =
    moreCount > 0
      ? `<tr><td style="padding:2px 4px 0;font-size:13px;color:#8a8a8a">and ${moreCount} more</td></tr>`
      : ""
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;padding:36px">
      <tr><td style="font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#3f9b6a;padding-bottom:14px">Jobs needing attention</td></tr>
      <tr><td style="font-size:22px;font-weight:700;line-height:1.35;color:#1f1f1f">${escapeHtml(copy.title)}</td></tr>
      <tr><td style="font-size:14px;line-height:1.5;color:#6f6f6f;padding:10px 0 22px">${escapeHtml(copy.intro)}</td></tr>
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}${moreRow}</table>
      </td></tr>
      <tr><td style="padding-top:24px">
        <a href="${safeUrl(href)}" style="background:#3f9b6a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;font-size:15px;font-weight:600">Review jobs</a>
      </td></tr>
      <tr><td style="padding-top:28px;font-size:12px;line-height:1.5;color:#a0a0a0">You're getting this because these roles have been sitting untouched in JobTracker.</td></tr>
    </table>
  </td></tr></table></body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Resolve a deep link to an absolute URL and escape it for an href attribute. Only http(s) is
// allowed (so a crafted "javascript:" link can never reach the button); anything else falls back
// to the app origin.
function safeUrl(href: string): string {
  const url = href.startsWith("http") ? href : `${env.APP_URL}${href}`
  if (!/^https?:\/\//i.test(url)) return escapeHtml(env.APP_URL)
  return escapeHtml(url)
}
