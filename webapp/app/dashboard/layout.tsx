import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { getSessionUser } from "@/lib/auth/current-user"
import { listNotifications, unreadCount } from "@/lib/server/notifications"
import { countOpenReminders } from "@/lib/server/reminders"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Dashboard — JobTracker",
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Gate + identity in one read: redirects to sign-in when unauthenticated, and bridges the Neon
  // Auth user into our local `users` table so downstream userId FKs are satisfied (see docs/AUTH.md).
  const user = await getSessionUser()
  const [notifications, unread, openReminders] = await Promise.all([
    listNotifications(user.id, { limit: 20 }),
    unreadCount(user.id),
    countOpenReminders(user.id),
  ])

  return (
    <DashboardShell
      user={{ name: user.name?.trim() || user.email, email: user.email }}
      initialNotifications={notifications}
      initialUnread={unread}
      openReminders={openReminders}
    >
      {children}
    </DashboardShell>
  )
}
