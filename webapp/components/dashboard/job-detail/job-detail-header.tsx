"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Bell, Building2, MoreHorizontal, Trash2 } from "lucide-react"
import type { JobStatus } from "@prisma/client"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { displayCompany } from "@/components/dashboard/logo-tile"
import { createReminder } from "@/lib/reminders/client"
import { StatusMenu } from "./status-menu"
import { Menu, MenuItem } from "./menu"
import { ReminderPopover, type ReminderDraft } from "./reminder-popover"
import { DeleteJobDialog } from "./delete-job-dialog"

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
  }
}) {
  const router = useRouter()
  const [showDelete, setShowDelete] = useState(false)
  const company = displayCompany(job.company)

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
          <p className="mt-1 text-sm">
            <span
              className={cn(
                "font-medium text-foreground",
                !company && "font-normal italic text-muted-foreground/70",
              )}
            >
              {company ?? "Company unknown"}
            </span>
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <StatusMenu jobId={job.id} status={job.status} />

        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open original
            <ArrowUpRight className="size-3.5" data-icon="inline-end" />
          </a>
        )}

        <ReminderPopover
          company={company}
          onSubmit={addReminder}
          renderTrigger={({ open }) => (
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                open && "bg-muted text-foreground",
              )}
            >
              <Bell className="size-3.5" data-icon="inline-start" />
              Remind me
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
