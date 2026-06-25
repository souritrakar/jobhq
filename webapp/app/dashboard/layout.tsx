import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { getServerUserId } from "@/lib/auth/current-user"
import { listNotifications, unreadCount } from "@/lib/server/notifications"

export const metadata = {
  title: "Dashboard — JobTracker",
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userId = getServerUserId()
  const [notifications, unread] = await Promise.all([
    listNotifications(userId, { limit: 20 }),
    unreadCount(userId),
  ])

  return (
    <DashboardShell initialNotifications={notifications} initialUnread={unread}>
      {children}
    </DashboardShell>
  )
}
