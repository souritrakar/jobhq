import { ScanSearch } from "lucide-react"

import { PageStub } from "@/components/dashboard/page-stub"

export const metadata = { title: "Resume ATS Checker · jobhq" }

export default function ResumeAtsCheckerPage() {
  return (
    <PageStub
      title="Resume ATS Checker"
      description="Score your resume against a job description for ATS readiness."
      icon={ScanSearch}
      hint="Upload a resume and a job post to see exactly how an applicant tracking system reads it."
      features={[
        "Overall ATS readiness score at a glance",
        "Missing keywords pulled from the job description",
        "Formatting and parseability warnings",
        "Concrete, prioritized fixes to raise your match",
      ]}
    />
  )
}
