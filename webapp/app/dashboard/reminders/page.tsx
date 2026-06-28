import { getServerUserId } from "@/lib/auth/current-user"
import { listReminders } from "@/lib/server/reminders"
import { RemindersFeed } from "@/components/dashboard/reminders-feed"

export const dynamic = "force-dynamic"
export const metadata = { title: "Reminders — JobTracker" }

// Reminders are now persisted: fetch the user's reminders on the server and hand them to the feed.
export default async function RemindersPage() {
  const reminders = await listReminders(await getServerUserId())
  return <RemindersFeed reminders={reminders} />
}
