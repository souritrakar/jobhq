import { Settings } from "lucide-react"

import { PageStub } from "@/components/dashboard/page-stub"

export const metadata = { title: "Settings — JobTracker" }

export default function SettingsPage() {
  return (
    <PageStub
      title="Settings"
      description="Account, notifications, and your extension connection."
      icon={Settings}
      hint="Manage your profile, reminder preferences, and AI auto-apply options here soon."
    />
  )
}
