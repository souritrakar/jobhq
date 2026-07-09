import { cn } from "@/lib/utils"
import { PLAN_META, type PlanId } from "@/lib/billing/plans"

/** A small Free/Pro pill for the account menu. Pro is filled with the brand accent; Free is muted. */
export function PlanBadge({ plan, className }: { plan: PlanId; className?: string }) {
  const isPro = plan === "pro"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none",
        isPro ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
        className,
      )}
    >
      {PLAN_META[plan].name}
    </span>
  )
}
