"use client"

import Link from "next/link"
import { LogOut, Settings } from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar } from "@/components/ui/avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { signOutAction } from "@/lib/auth/actions"

/**
 * The account menu — the dashboard profile avatar is now a real trigger: clicking it opens a
 * popover with the signed-in user's name + email, a Settings shortcut, and a Sign out button. The
 * popover portals (via the shadcn Popover), so it floats above the page chrome. Sign out posts to a
 * server action that clears the session cookie and redirects to sign-in. See docs/AUTH.md.
 */
export function UserMenu({
  name,
  email,
  className,
}: {
  name: string
  email: string
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${name} — account menu`}
        className={cn(
          "grid size-9 cursor-pointer place-items-center rounded-full transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          className,
        )}
      >
        <Avatar name={name} className="size-8 ring-1 ring-border" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-60 gap-0 p-0">
        <div className="flex items-center gap-2.5 p-3">
          <Avatar name={name} className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
        </div>

        <div className="flex flex-col border-t border-border p-1">
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Settings className="size-4 opacity-80" />
            Settings
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  )
}
