import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { deleteTransaction } from "@/lib/actions/transactions";
import type { TransactionListItem } from "@/lib/data/transactions";
import { formatDateLabel } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type TransactionListProps = {
  items: TransactionListItem[];
  currency: string;
  locale: string;
};

const NATURE_LABEL: Record<string, string> = {
  daily: "Daily",
  fixed: "Fixed",
  recurring: "Recurring",
};

/** Group by day so a list of forty entries reads as a handful of days. */
function groupByDate(items: TransactionListItem[]) {
  const groups = new Map<string, TransactionListItem[]>();
  for (const item of items) {
    const existing = groups.get(item.occurredOn);
    if (existing) existing.push(item);
    else groups.set(item.occurredOn, [item]);
  }
  return [...groups.entries()];
}

export function TransactionList({ items, currency, locale }: TransactionListProps) {
  return (
    <div className="space-y-6">
      {groupByDate(items).map(([date, dayItems]) => {
        const dayNet = dayItems.reduce(
          (sum, item) => sum + (item.direction === "income" ? item.amount : -item.amount),
          0,
        );

        return (
          <section key={date}>
            <header className="flex items-baseline justify-between pb-1.5">
              <h2 className="text-sm font-semibold">{formatDateLabel(date, locale)}</h2>
              <span
                className={cn(
                  "tabular text-xs",
                  dayNet >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground",
                )}
              >
                {dayNet >= 0 ? "+" : ""}
                {formatMoney(dayNet, currency, locale)}
              </span>
            </header>

            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {dayItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.categoryColor ?? "#64748b" }}
                    aria-hidden
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.merchant || item.categoryName || "Uncategorised"}
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5 truncate text-xs text-muted-foreground">
                      {item.merchant && item.categoryName ? <span>{item.categoryName}</span> : null}
                      {item.accountName ? <span>· {item.accountName}</span> : null}
                      {item.note ? <span>· {item.note}</span> : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.status === "draft" ? <Badge tone="warning">Draft</Badge> : null}
                    {item.expenseNature ? (
                      <Badge>{NATURE_LABEL[item.expenseNature]}</Badge>
                    ) : null}
                    {item.incomeType ? (
                      <Badge tone="positive">
                        {item.incomeType === "active" ? "Active" : "Passive"}
                      </Badge>
                    ) : null}
                  </div>

                  <span
                    className={cn(
                      "tabular shrink-0 text-sm font-semibold",
                      item.direction === "income"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground",
                    )}
                  >
                    {item.direction === "income" ? "+" : "−"}
                    {formatMoney(item.amount, currency, locale)}
                  </span>

                  <div className="flex shrink-0 items-center">
                    <Link
                      href={`/transactions/${item.id}`}
                      aria-label="Edit transaction"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Link>
                    <form action={deleteTransaction}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        type="submit"
                        aria-label="Delete transaction"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-rose-600"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
