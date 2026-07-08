"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Building2, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react"
import type { JobStatus } from "@prisma/client"

import { cn } from "@/lib/utils"
import { savedLabel } from "@/lib/dates"
import { buttonVariants } from "@/components/ui/button"
import { Tooltip } from "@/components/ui/tooltip"
import { displayCompany } from "@/components/dashboard/logo-tile"
import { createReminder } from "@/lib/reminders/client"
import { StatusMenu } from "./status-menu"
import { Menu, MenuItem } from "./menu"
import { ReminderPopover, type ReminderDraft } from "./reminder-popover"
import { DeleteJobDialog } from "./delete-job-dialog"

// A quiet middot separator between the identity line's facts.
function MetaDot() {
  return <span aria-hidden className="text-muted-foreground/40">·</span>
}

// Only let http(s) URLs into an href. `job.url` is captured/imported from arbitrary postings and
// isn't trusted, so a `javascript:`/`data:` scheme must never reach an anchor (XSS). Returns the
// URL when safe, else null so the caller falls back to non-clickable text.
function safeHttpUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const { protocol } = new URL(url)
    return protocol === "http:" || protocol === "https:" ? url : null
  } catch {
    return null
  }
}

/**
 * The page's Tier-1 identity block + primary actions. Title leads at display weight; company and
 * source recede beneath it. Actions are deliberately split: the status changer and "Open
 * original" sit here as the two highest-frequency controls, while Delete is tucked into an
 * overflow menu so the header stays calm (per the agreed action hierarchy).
 */
export function JobDetailHeader({
  job,
}: {
  job: {
    id: string
    title: string
    company: string
    source: string | null
    url: string | null
    status: JobStatus
    updatedAt: Date
  }
}) {
  const router = useRouter()
  const [showDelete, setShowDelete] = useState(false)
  const company = displayCompany(job.company)
  // Guarded, http(s)-only URL for the "Open original" anchor — raw job.url is untrusted (see safeHttpUrl).
  const url = safeHttpUrl(job.url)

  // Fast-capture from the header: persist, then refresh so the rail's Reminders card picks it up.
  async function addReminder(draft: ReminderDraft) {
    await createReminder(job.id, draft)
    router.refresh()
  }

  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-4">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-[30%] bg-accent text-lg font-semibold text-accent-foreground"
        >
          {company ? company.charAt(0).toUpperCase() : <Building2 className="size-6" />}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-[1.75rem]">
            {job.title}
          </h1>
          {/* Identity line: company anchors it in foreground weight; the source link (blue, when we
              have a URL) and last-updated recency trail behind, dot-separated, so the provenance
              reads at a glance without a dedicated card. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-tight">
            <span
              className={cn(
                "font-medium text-foreground",
                !company && "font-normal italic text-muted-foreground/70",
              )}
            >
              {company ?? "Company unknown"}
            </span>
            <MetaDot />
            <span className="text-muted-foreground">Updated {savedLabel(job.updatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Keyed by the server status so a date-driven change elsewhere (setting/clearing an
            interview date auto-moves the stage) re-syncs the pill after router.refresh(); the
            menu's own optimistic changes are unaffected since they don't alter the server prop. */}
        <StatusMenu key={job.status} jobId={job.id} status={job.status} />

        {url && (
          <Tooltip label="Open original">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open original posting"
              className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
            >
              <ExternalLink className="size-4" />
            </a>
          </Tooltip>
        )}

        <ReminderPopover
          company={company}
          onSubmit={addReminder}
          tooltip="Remind me"
          renderTrigger={({ open }) => (
            <button
              type="button"
              aria-label="Remind me"
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-sm" }),
                open && "bg-muted text-foreground",
              )}
            >
              <Bell className="size-4" />
            </button>
          )}
        />

        <Menu
          renderTrigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-haspopup="menu"
              aria-label="More actions"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                open && "bg-muted",
              )}
            >
              <MoreHorizontal className="size-4" />
            </button>
          )}
        >
          {({ close }) => (
            <MenuItem
              icon={Trash2}
              tone="danger"
              onClick={() => {
                close()
                setShowDelete(true)
              }}
            >
              Delete job
            </MenuItem>
          )}
        </Menu>
      </div>

      <DeleteJobDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        jobId={job.id}
        jobTitle={job.title}
      />
    </header>
  )
}
