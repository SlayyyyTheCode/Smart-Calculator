import { ProgressBar } from "@/components/ui/progress-bar";
import type { BudgetStatus } from "@/lib/data/budgets";
import { BUDGET_LEVEL_STYLES } from "@/lib/domain/budget";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type BudgetStatusListProps = {
  statuses: BudgetStatus[];
  currency: string;
  locale: string;
};

/**
 * Budget against actual, one row per budget. Colour comes from
 * BUDGET_LEVEL_STYLES so the green/amber/red boundaries here are the same
 * boundaries used everywhere else.
 */
export function BudgetStatusList({ statuses, currency, locale }: BudgetStatusListProps) {
  return (
    <ul className="space-y-3">
      {statuses.map((status) => {
        const { evaluation } = status;
        const styles = BUDGET_LEVEL_STYLES[evaluation.level];

        return (
          <li key={status.budgetId} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-2">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: status.categoryColor ?? "#64748b" }}
                  aria-hidden
                />
                <span className="text-sm font-medium">{status.categoryName}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                    styles.badge,
                  )}
                >
                  {styles.label}
                </span>
              </div>

              <span className="tabular text-sm">
                <span className="font-semibold">
                  {formatMoney(evaluation.spent, currency, locale)}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  of {formatMoney(evaluation.limit, currency, locale)}
                </span>
              </span>
            </div>

            <ProgressBar
              value={evaluation.pctUsed}
              barClassName={styles.bar}
              label={`${status.categoryName} budget`}
            />

            <p className="pt-1.5 text-xs text-muted-foreground">
              {evaluation.level === "exceeded" ? (
                <span className={styles.text}>
                  {formatMoney(evaluation.overspend, currency, locale)} over
                </span>
              ) : (
                <>
                  <span className={evaluation.level === "warning" ? styles.text : undefined}>
                    {formatMoney(evaluation.remaining, currency, locale)} left
                  </span>
                </>
              )}
              {" · "}
              {Math.round(evaluation.pctUsed)}% used
              {evaluation.level === "ok"
                ? ` · warns at ${evaluation.warnThresholdPct}%`
                : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
