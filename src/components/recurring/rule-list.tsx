import Link from "next/link";
import { Pause, Pencil, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { setRuleActive } from "@/lib/actions/recurring";
import type { RecurringRuleItem } from "@/lib/data/recurring";
import { formatDateLabel } from "@/lib/date";
import { describeRecurrence, nextOccurrence } from "@/lib/domain/recurring";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type RuleListProps = {
  rules: RecurringRuleItem[];
  currency: string;
  locale: string;
  today: string;
};

export function RuleList({ rules, currency, locale, today }: RuleListProps) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {rules.map((rule) => {
        const isVariable = rule.expenseNature === "recurring";
        const amount = isVariable ? rule.estimatedAmount : rule.amount;
        const next = rule.isActive
          ? nextOccurrence(
              {
                frequency: rule.frequency,
                intervalCount: rule.intervalCount,
                startDate: rule.startDate,
                endDate: rule.endDate,
                dayOfMonth: rule.dayOfMonth,
              },
              today,
            )
          : null;

        return (
          <li key={rule.id} className={cn("px-4 py-3", !rule.isActive && "opacity-60")}>
            <div className="flex items-center gap-3">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: rule.categoryColor ?? "#64748b" }}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{rule.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {describeRecurrence({
                    frequency: rule.frequency,
                    intervalCount: rule.intervalCount,
                    startDate: rule.startDate,
                    dayOfMonth: rule.dayOfMonth,
                  })}
                  {rule.categoryName ? ` · ${rule.categoryName}` : ""}
                  {rule.accountName ? ` · ${rule.accountName}` : ""}
                </p>
              </div>

              {!rule.isActive ? <Badge>Paused</Badge> : null}
              {isVariable ? <Badge tone="warning">Estimate</Badge> : null}

              <span className="tabular shrink-0 text-sm font-semibold">
                {amount === null ? "—" : formatMoney(amount, currency, locale)}
              </span>

              <div className="flex shrink-0 items-center">
                <Link
                  href={`/recurring/${rule.id}`}
                  aria-label={`Edit ${rule.label}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                >
                  <Pencil className="size-4" aria-hidden />
                </Link>
                <form action={setRuleActive}>
                  <input type="hidden" name="id" value={rule.id} />
                  <input type="hidden" name="active" value={rule.isActive ? "false" : "true"} />
                  <button
                    type="submit"
                    aria-label={rule.isActive ? `Pause ${rule.label}` : `Resume ${rule.label}`}
                    title={
                      rule.isActive
                        ? "Pause. Nothing further is posted until you resume."
                        : "Resume"
                    }
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  >
                    {rule.isActive ? (
                      <Pause className="size-4" aria-hidden />
                    ) : (
                      <Play className="size-4" aria-hidden />
                    )}
                  </button>
                </form>
              </div>
            </div>

            <p className="pl-6 pt-1 text-xs text-muted-foreground">
              {next ? `Next on ${formatDateLabel(next, locale)}` : "No further occurrences"}
              {rule.lastMaterializedOn
                ? ` · last posted ${formatDateLabel(rule.lastMaterializedOn, locale)}`
                : " · nothing posted yet"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
