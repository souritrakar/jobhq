import { Sparkles } from "lucide-react"

import { PageStub } from "@/components/dashboard/page-stub"

export const metadata = { title: "AI Resume Builder — JobTracker" }

export default function ResumeBuilderPage() {
  return (
    <PageStub
      title="AI Resume Builder"
      description="Generate and tailor a resume for each role you save."
      icon={Sparkles}
      hint="Draft, edit, and export a polished resume with AI assistance here soon."
    />
  )
}
