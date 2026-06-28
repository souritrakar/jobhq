"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { savedLabel } from "@/lib/dates"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/client"
import type { NotificationDto } from "@/lib/notifications/types"
import { Menu } from "@/components/dashboard/job-detail/menu"

/**
 * The dashboard notifications bell: a server-seeded, focus-revalidated dropdown.
 *
 * Initial items + unread count arrive as props (rendered on the server), so the badge is correct on
 * first paint with no client round-trip. After that it stays fresh by *revalidating on window focus*
 * and on dropdown open — deliberately NOT polling (no setInterval): the list is low-churn and a tab
 * the user isn't looking at doesn't need updates. A `fetching` ref guards against overlapping
 * refreshes (e.g. focus firing while a click-driven refresh is in flight).
 */
export function NotificationsBell({
  initialItems,
  initialUnread,
}: {
  initialItems: NotificationDto[]
  initialUnread: number
}) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [unread, setUnread] = useState(initialUnread)
  const fetching = useRef(false)

  // Pull the server's truth. Recomputes unread from the freshly-fetched rows so the badge can't
  // drift from the list. Skipped when a fetch is already in flight.
  async function refresh() {
    if (fetching.current) return
    fetching.current = true
    try {
      const next = await listNotifications()
      setItems(next)
      setUnread(next.filter((n) => !n.readAt).length)
    } catch {
      // Leave the last-known-good list in place; the next focus/open will retry.
    } finally {
      fetching.current = false
    }
  }

  // Revalidate on mount and whenever the window regains focus — this replaces polling.
  useEffect(() => {
    refresh()
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onItemClick(item: NotificationDto, close: () => void) {
    close()
    if (item.href) router.push(item.href)
    if (item.readAt) return

    // Optimistic: stamp read locally and drop the badge by one, then persist.
    const stamp = new Date().toISOString()
    setItems((cur) => cur.map((n) => (n.id === item.id ? { ...n, readAt: stamp } : n)))
    setUnread((u) => Math.max(0, u - 1))
    try {
      await markNotificationRead(item.id)
    } catch {
      void refresh()
    }
  }

  async function onMarkAll() {
    if (unread === 0) return
    const stamp = new Date().toISOString()
    setItems((cur) => cur.map((n) => (n.readAt ? n : { ...n, readAt: stamp })))
    setUnread(0)
    try {
      await markAllNotificationsRead()
    } catch {
      void refresh()
    }
  }

  return (
    <Menu
      align="start"
      panelClassName="w-80 max-w-[calc(100vw-1.5rem)] p-0"
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={() => {
            toggle()
            if (!open) void refresh()
          }}
          aria-expanded={open}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className={cn(
            "relative grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            open && "text-foreground",
          )}
        >
          <Bell className="size-[19px]" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid min-w-[15px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-[15px] text-primary-foreground tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex max-h-[26rem] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              type="button"
              onClick={onMarkAll}
              disabled={unread === 0}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Check className="size-3.5" />
              Mark all read
            </button>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
                <Bell className="size-4" />
              </span>
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="max-w-[14rem] text-xs text-muted-foreground">
                Reminders, interviews, and digests will show up here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50 overflow-y-auto">
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onClick={() => onItemClick(item, close)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Menu>
  )
}

function NotificationRow({
  item,
  onClick,
}: {
  item: NotificationDto
  onClick: () => void
}) {
  const isUnread = !item.readAt
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        isUnread && "bg-primary/[0.04]",
      )}
    >
      <span className="mt-1.5 shrink-0">
        <span
          className={cn(
            "block size-2 rounded-full",
            isUnread ? "bg-primary" : "bg-transparent",
          )}
          aria-hidden
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "min-w-0 line-clamp-2 break-words text-[13px] leading-snug text-foreground",
              isUnread ? "font-semibold" : "font-medium",
            )}
          >
            {item.title}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
            {savedLabel(item.createdAt)}
          </span>
        </span>
        {item.body && (
          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </span>
        )}
      </span>
    </button>
  )
}
