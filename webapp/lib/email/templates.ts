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

export function reminderEmail(copy: { title: string; body: string }, href: string): string {
  return shell(copy.title, escapeHtml(copy.body), { label: "View in JobTracker", href })
}

export function digestEmail(copy: { title: string; body: string }, href: string): string {
  const html = escapeHtml(copy.body).replace(/\n/g, "<br>")
  return shell(copy.title, html, { label: "Review jobs", href })
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
