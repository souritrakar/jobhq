import { NotebookPen } from "lucide-react"

import { Card } from "@/components/ui/card"
import { NotesEditor } from "./notes-editor"

/**
 * The page's hero panel — a job's private notes, deliberately the loudest card in the reading
 * column because it's the thing the seeker actually returns to ("recruiter is X", "referred by Y").
 * Warm fern wash + a solid badge lift it above the quieter metadata around it.
 */
export function NotesPanel({ jobId, notes }: { jobId: string; notes: string | null }) {
  return (
    <Card className="relative overflow-hidden border-fern-100 bg-fern-50/50 shadow-sm">
      <div className="flex items-center gap-3 px-5 pt-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <NotebookPen className="size-[19px]" />
        </span>
        <h2 className="min-w-0 text-[15px] font-semibold leading-tight tracking-tight text-foreground">
          Notes
        </h2>
      </div>

      <div className="px-5 pb-5 pt-3.5">
        <NotesEditor jobId={jobId} notes={notes} />
      </div>
    </Card>
  )
}
