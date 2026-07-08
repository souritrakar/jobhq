"use client"

import { useEffect, useRef, useState, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import { Bell, Briefcase, CalendarClock, Check, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { savedLabel } from "@/lib/dates"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/client"
import type { NotificationDto, NotificationKind } from "@/lib/notifications/types"
import { Menu } from "@/components/dashboard/job-detail/menu"

// Each notification kind carries a semantic mark: an icon so the *type* of nudge is legible before
// the text is read, and a restrained tint that reuses the app's existing urgency language — fern
// (brand) for a reminder to act, warm clay for a time-pressing interview, calm muted for a digest
// roundup. Color is spent only to rank, never to decorate.
const KIND_MARK: Record<
  NotificationKind,
  { Icon: ComponentType<{ className?: string }>; tint: string }
> = {
  reminder: { Icon: Clock, tint: "bg-primary/10 text-primary" },
  interview: {
    Icon: CalendarClock,
    tint: "bg-clay-soft text-clay-ink dark:bg-clay/15 dark:text-clay",
  },
  digest: { Icon: Briefcase, tint: "bg-muted text-muted-foreground" },
}

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
      panelClassName="w-96 max-w-[calc(100vw-1.5rem)] p-0"
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
        <div className="flex max-h-[28rem] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-tight">Notifications</span>
              {unread > 0 && (
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {unread} new
                </span>
              )}
            </div>
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
            <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <Bell className="size-4.5" />
              </span>
              <p className="mt-0.5 text-sm font-medium">You're all caught up</p>
              <p className="max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
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
  const { Icon, tint } = KIND_MARK[item.kind]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        isUnread && "bg-primary/[0.05]",
      )}
    >
      {/* Kind mark — the row's anchor. The unread badge rides its corner so the "new" signal and the
          "what kind" signal read as one glance instead of two competing dots. */}
      <span className="relative mt-0.5 shrink-0">
        <span className={cn("grid size-8 place-items-center rounded-full", tint)}>
          <Icon className="size-4" />
        </span>
        {isUnread && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background"
          />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "min-w-0 line-clamp-2 break-words text-[13px] leading-snug text-foreground",
              isUnread ? "font-semibold" : "font-medium",
            )}
          >
            {item.title}
          </span>
          <span className="mt-px shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
            {savedLabel(item.createdAt)}
          </span>
        </span>
        {item.body && <NotificationBody text={item.body} />}
      </span>
    </button>
  )
}

// Leading block markers on a body line, kept generic so the renderer never needs to know which
// notification produced the text: a heading ("#".."###"), or a bullet ("•", "-", "*") + a space.
const HEADING_LINE = /^\s*#{1,3}\s+/
const BULLET_LINE = /^\s*[•\-*]\s+/

// Renders a notification's plain-text body with a typographic hierarchy. The body is authored as
// newline-delimited lines (see lib/reminders/copy.ts): some are bullets, some headings, the rest
// prose. HTML would collapse the newlines into one run, so a digest's list flattens into a single
// sentence — here each block gets structure *and* its own type treatment so a glance separates the
// substance from the connective text:
//   • heading  — a small structural label (uppercase, tight), the loudest block
//   • bullets  — the payload (each role/item): foreground weight, sized above prose
//   • prose    — the quiet lead-in and asides: muted and small
// Deliberately tiny and format-driven — no per-notification special-casing.
function NotificationBody({ text }: { text: string }) {
  const blocks: { type: "h" | "ul" | "p"; items: string[] }[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    if (HEADING_LINE.test(line)) {
      blocks.push({ type: "h", items: [line.replace(HEADING_LINE, "")] })
      continue
    }
    const isBullet = BULLET_LINE.test(line)
    const content = isBullet ? line.replace(BULLET_LINE, "") : line
    const last = blocks.at(-1)
    // Merge only consecutive bullets into one list; headings and paragraphs always stand alone.
    if (isBullet && last?.type === "ul") last.items.push(content)
    else blocks.push({ type: isBullet ? "ul" : "p", items: [content] })
  }

  return (
    <div className="mt-1.5 space-y-2">
      {blocks.map((block, i) => {
        if (block.type === "h") {
          return (
            <p
              key={i}
              className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70"
            >
              {block.items[0]}
            </p>
          )
        }
        if (block.type === "ul") {
          return (
            <ul key={i} className="space-y-1">
              {block.items.map((li, j) => (
                <li
                  key={j}
                  className="flex gap-2 text-[13px] font-medium leading-snug text-foreground/85"
                >
                  <span
                    aria-hidden
                    className="mt-[7px] size-1 shrink-0 rounded-full bg-foreground/30"
                  />
                  <span className="min-w-0 break-words">{li}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="text-xs leading-relaxed text-muted-foreground">
            {block.items[0]}
          </p>
        )
      })}
    </div>
  )
}
