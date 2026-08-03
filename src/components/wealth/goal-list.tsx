import { Check, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { ProgressBar } from "@/components/ui/progress-bar";
import { contributeToGoal, deleteGoal } from "@/lib/actions/wealth";
import type { GoalItem } from "@/lib/data/wealth";
import { formatDateLabel } from "@/lib/date";
import { goalProgress } from "@/lib/domain/goals";
import { formatMoney } from "@/lib/money";

type GoalListProps = {
  goals: GoalItem[];
  currency: string;
  locale: string;
  today: string;
  currencySymbol: string;
};

export function GoalList({ goals, currency, locale, today, currencySymbol }: GoalListProps) {
  return (
    <ul className="space-y-3">
      {goals.map((goal) => {
        const progress = goalProgress(goal, today);
        const complete = progress.status === "complete";

        return (
          <li key={goal.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{goal.name}</span>
                {complete ? (
                  <Badge tone="positive">
                    <Check className="size-3" aria-hidden />
                    Reached
                  </Badge>
                ) : progress.status === "overdue" ? (
                  <Badge tone="negative">Past its date</Badge>
                ) : null}
              </div>

              <span className="tabular text-sm">
                <span className="font-semibold">
                  {formatMoney(goal.currentAmount, currency, locale)}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  of {formatMoney(goal.targetAmount, currency, locale)}
                </span>
              </span>
            </div>

            <ProgressBar
              value={progress.ratio * 100}
              barClassName={complete ? "bg-emerald-500" : "bg-accent"}
              label={`${goal.name} progress`}
            />

            <p className="pt-1.5 text-xs text-muted-foreground">
              {complete ? (
                "Fully funded."
              ) : (
                <>
                  {formatMoney(progress.remaining, currency, locale)} to go
                  {goal.targetDate ? ` · by ${formatDateLabel(goal.targetDate, locale)}` : ""}
                  {progress.requiredMonthly !== null ? (
                    <>
                      {" · "}
                      <span className="font-medium text-foreground">
                        {formatMoney(progress.requiredMonthly, currency, locale)} a month
                      </span>
                      {progress.monthsRemaining
                        ? ` for ${progress.monthsRemaining} ${progress.monthsRemaining === 1 ? "month" : "months"}`
                        : " — due now"}
                    </>
                  ) : (
                    " · no target date, so no monthly figure"
                  )}
                </>
              )}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-3">
              {!complete ? (
                <form action={contributeToGoal} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={goal.id} />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {currencySymbol}
                    </span>
                    <Input
                      name="amount"
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={`Amount to add to ${goal.name}`}
                      className="tabular h-8 w-28 pl-7 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-muted"
                  >
                    Add
                  </button>
                </form>
              ) : null}

              <form action={deleteGoal} className="ml-auto">
                <input type="hidden" name="id" value={goal.id} />
                <button
                  type="submit"
                  aria-label={`Delete ${goal.name}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-rose-600"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
