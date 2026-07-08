import { Bot } from "lucide-react"

import { PageStub } from "@/components/dashboard/page-stub"

export const metadata = { title: "AI Resume Agent — jobhq" }

export default function ResumeAgentPage() {
  return (
    <PageStub
      title="AI Resume Agent"
      description="Let an agent tailor your resume across your saved jobs automatically."
      icon={Bot}
      hint="An autonomous agent that adapts your resume for every application, so each one lands ready to submit."
      features={[
        "Generates a tailored resume per saved job",
        "Works in the background across your whole pipeline",
        "Keeps a master profile in sync with every version",
        "Review and approve changes before anything is sent",
      ]}
    />
  )
}
