import { ScanSearch } from "lucide-react"

import { PageStub } from "@/components/dashboard/page-stub"

export const metadata = { title: "Resume ATS Checker — JobTracker" }

export default function ResumeAtsCheckerPage() {
  return (
    <PageStub
      title="Resume ATS Checker"
      description="Score your resume against a job description for ATS readiness."
      icon={ScanSearch}
      hint="Upload a resume and a job post to see keyword match and formatting issues here soon."
    />
  )
}
