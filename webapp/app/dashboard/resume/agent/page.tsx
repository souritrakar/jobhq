import { Bot } from "lucide-react"

import { PageStub } from "@/components/dashboard/page-stub"

export const metadata = { title: "AI Resume Agent — JobTracker" }

export default function ResumeAgentPage() {
  return (
    <PageStub
      title="AI Resume Agent"
      description="Let an agent tailor your resume across your saved jobs automatically."
      icon={Bot}
      hint="An autonomous agent that adapts your resume per application lands here soon."
    />
  )
}
