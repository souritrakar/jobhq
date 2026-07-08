import { Sparkles } from "lucide-react"

import { PageStub } from "@/components/dashboard/page-stub"

export const metadata = { title: "AI Resume Builder · jobhq" }

export default function ResumeBuilderPage() {
  return (
    <PageStub
      title="AI Resume Builder"
      description="Generate and tailor a resume for each role you save."
      icon={Sparkles}
      hint="Draft, edit, and export a polished resume with AI assistance, purpose-built for every role you apply to."
      features={[
        "Start from your uploaded resume or a clean template",
        "Tailor wording to a specific saved job in one click",
        "Live editing with section-by-section suggestions",
        "Export to PDF and DOCX, ready to send",
      ]}
    />
  )
}
