import { ListTodo } from "lucide-react"

import { isOverdue } from "@/lib/dates"
import { isOpen } from "@/lib/reminders/status"
import type { Reminder } from "@/lib/reminders/types"
import { PanelCard } from "./panel-card"
import { TodoCard } from "./todo-card"

/**
 * The To-do panel — wraps the per-job task list in the shared panel chrome. A row is a plain to-do
 * (text only) or a reminder (it carries a due date and fires); the list holds both. The header
 * stays quiet on purpose: no "open" count (that was noise), only a red "overdue" badge when a dated
 * reminder is actually past due — the one thing worth pulling the eye.
 */
export function TodoPanel({
  jobId,
  reminders,
}: {
  jobId: string
  reminders: Reminder[]
}) {
  const overdue = reminders.filter(
    (r) => isOpen(r) && r.dueAt !== undefined && isOverdue(r.dueAt, r.hasTime),
  ).length

  return (
    <PanelCard
      icon={ListTodo}
      title="To-do"
      meta={
        overdue > 0 ? (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-destructive">
            {overdue} overdue
          </span>
        ) : null
      }
    >
      <TodoCard jobId={jobId} reminders={reminders} />
    </PanelCard>
  )
}
