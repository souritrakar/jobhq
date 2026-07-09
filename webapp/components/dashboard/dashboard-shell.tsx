"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell,
  BookOpen,
  Bookmark,
  Bot,
  ChevronDown,
  CreditCard,
  FileText,
  Files,
  House,
  Mail,
  Menu,
  Plus,
  ScanSearch,
  Settings,
  Sparkles,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { Logo } from "@/components/landing/logo"
import { SidebarItem } from "@/components/dashboard/sidebar-item"
import { ImportJobDialog } from "@/components/dashboard/import-job-dialog"
import { NotificationsBell } from "@/components/dashboard/notifications-bell"
import { UserMenu } from "@/components/dashboard/user-menu"
import type { NotificationDto } from "@/lib/notifications/types"
import type { PlanId } from "@/lib/billing/plans"

/** The signed-in user's display fields, threaded from the dashboard layout's session read. */
export type ShellUser = { name: string; email: string }

const NAV = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/dashboard/saved", label: "Jobs", icon: Bookmark },
  { href: "/dashboard/reminders", label: "Reminders", icon: Bell },
  { href: "/dashboard/documents", label: "Documents", icon: Files },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const

// Resume is a parent section: four separate routes nested under one expandable row.
const RESUME_NAV = [
  { href: "/dashboard/resume/builder", label: "AI Resume Builder", icon: Sparkles },
  { href: "/dashboard/resume/ats-checker", label: "Resume ATS Checker", icon: ScanSearch },
  { href: "/dashboard/resume/cover-letter", label: "Cover Letter", icon: Mail },
  { href: "/dashboard/resume/agent", label: "AI Resume Agent", icon: Bot },
] as const

function NavLinks({
  onNavigate,
  reminderCount,
}: {
  onNavigate?: () => void
  reminderCount: number
}) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon }) => (
        <SidebarItem
          key={href}
          href={href}
          label={label}
          icon={icon}
          active={href === "/dashboard" ? pathname === href : pathname.startsWith(href)}
          alertCount={href === "/dashboard/reminders" ? reminderCount : undefined}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}

function ResumeGroup({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const sectionActive = pathname.startsWith("/dashboard/resume")
  const [open, setOpen] = useState(sectionActive)

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
          sectionActive
            ? "text-foreground"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        )}
      >
        <FileText
          className={cn("size-[17px] shrink-0", sectionActive && "text-primary")}
          strokeWidth={2}
        />
        <span className="flex-1 truncate text-left">Resume</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="ml-3.5 flex flex-col gap-0.5 border-l border-border pl-2">
          {RESUME_NAV.map(({ href, label, icon }) => (
            <SidebarItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={pathname.startsWith(href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarBody({
  onNavigate,
  initialNotifications,
  initialUnread,
  openReminders,
}: {
  onNavigate?: () => void
  initialNotifications: NotificationDto[]
  initialUnread: number
  openReminders: number
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center justify-between gap-2 px-1.5 pt-1.5">
        <Link href="/dashboard" onClick={onNavigate} aria-label="jobhq home">
          <Logo />
        </Link>
        <NotificationsBell
          initialItems={initialNotifications}
          initialUnread={initialUnread}
        />
      </div>

      {/* The one primary action — fern. Everything else in the chrome stays neutral.
          Opens the "save a job from a link" modal (no extension required). */}
      <ImportJobDialog
        trigger={
          <Button size="lg" className="w-full justify-center gap-2 rounded-md">
            <Plus className="size-4" strokeWidth={2.5} />
            Save a job
          </Button>
        }
      />

      <div className="flex flex-col gap-0.5">
        <NavLinks onNavigate={onNavigate} reminderCount={openReminders} />
        <ResumeGroup onNavigate={onNavigate} />
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {/* Extension nudge — capture is the daily-use surface that feeds this app. */}
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-sm font-medium">Get the extension</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Save jobs from any site in one click.
          </p>
          <Button variant="outline" size="sm" className="mt-2.5 w-full">
            Add to Chrome
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DashboardShell({
  children,
  user,
  plan,
  initialNotifications,
  initialUnread,
  openReminders,
}: {
  children: React.ReactNode
  user: ShellUser
  plan: PlanId
  initialNotifications: NotificationDto[]
  initialUnread: number
  openReminders: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarBody
          initialNotifications={initialNotifications}
          initialUnread={initialUnread}
          openReminders={openReminders}
        />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-1.5">
          <Link
            href="/dashboard/settings"
            aria-label="Help and docs"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            <BookOpen className="size-[18px]" />
          </Link>
          <UserMenu name={user.name} email={user.email} plan={plan} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-foreground/20" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-sidebar-border bg-sidebar shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <X className="size-5" />
            </Button>
            <SidebarBody
              onNavigate={() => setOpen(false)}
              initialNotifications={initialNotifications}
              initialUnread={initialUnread}
              openReminders={openReminders}
            />
          </div>
        </div>
      )}

      <main className="relative md:pl-64">
        {/* Desktop utility icons: float at the far top-right corner — no bar, no border,
            so the page content keeps its original position. */}
        <div className="absolute right-5 top-6 z-20 hidden items-center gap-1.5 sm:right-8 md:flex">
          <Link
            href="/dashboard/settings"
            aria-label="Help and docs"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "cursor-pointer text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:text-foreground",
            )}
          >
            <BookOpen className="size-[18px]" />
          </Link>
          <UserMenu name={user.name} email={user.email} plan={plan} />
        </div>
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">{children}</div>
      </main>
    </div>
  )
}
