import { memo, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent } from "@app/components/ui/card";
import { EmptyState } from "@app/components/ui/empty-state";
import { PageHeader } from "@app/components/ui/page-header";
import { formatDateLabel } from "@app/lib/date";
import { cn } from "@app/lib/utils";
import { Receipt } from "lucide-react";

import { evolu, type CategoryRow, type TransactionRow } from "../db";
import { useMoneyFormat } from "../money-format";
import { NONE } from "../schema";

/**
 * What a row calls itself.
 *
 * A category when there is one, otherwise whatever the row calls itself. An
 * imported statement arrives uncategorised, and a list of thirty rows all
 * reading "Uncategorised" is a list you cannot use — the merchant is the only
 * thing distinguishing the coffee from the rent.
 */
function labelFor(row: TransactionRow, nameById: Map<string, string>): string {
  const categoryId = String(row.categoryId);
  if (categoryId !== NONE) return nameById.get(categoryId) ?? "Unknown";
  if (String(row.merchant) !== NONE) return String(row.merchant);
  if (String(row.note) !== NONE) return String(row.note);
  return "Uncategorised";
}

/**
 * One row, memoised.
 *
 * Show more grows the window from a hundred rows to two hundred, and without
 * this React re-renders the first hundred too — the same rows with the same
 * values, but a new array means new work. Measured at 131 ms p95 to extend the
 * list and rising with every press, because the cost is per row on screen
 * rather than per row added.
 */
const Row = memo(function Row({
  row,
  label,
  money,
  locale,
}: {
  row: TransactionRow;
  label: string;
  money: (minor: number) => string;
  locale: string;
}) {
  const isExpense = String(row.direction) === "expense";
  const isDraft = String(row.status) === "draft";
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {formatDateLabel(String(row.occurredOn), locale)}
          {isExpense ? ` · ${String(row.expenseNature)}` : " · income"}
        </p>
      </div>

      {isDraft ? (
        <span
          className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400"
          data-testid="draft-badge"
        >
          Draft
        </span>
      ) : null}

      <span
        className={cn(
          "tabular shrink-0 text-sm font-medium",
          isExpense ? "" : "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {isExpense ? "−" : "+"}
        {money(Number(row.amountMinor))}
      </span>

      <button
        type="button"
        aria-label="Delete"
        data-testid="delete"
        onClick={() => evolu.update("transaction", { id: row.id, isDeleted: 1 })}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-rose-600"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  );
});

/** How many rows are put on screen at once. */
const PAGE = 100;

/**
 * Everything recorded, newest first — a window of it at a time.
 *
 * Drafts are shown but marked, never hidden. A recurring estimate you have not
 * confirmed is still something you are on the hook for; leaving it out of the
 * list while leaving it out of the totals would make it invisible.
 *
 * The window exists because rendering the lot does not scale, and the measured
 * numbers were not marginal: three years of ordinary spending is a few thousand
 * rows, and this screen took **7.4 seconds at 2,000 and 24.4 at 6,000** —
 * superlinear, because the cost is in the DOM rather than in the query. Every
 * other screen was under 450 ms on the same data, which is what made it obvious
 * where the time was going.
 *
 * A hundred rows is more than fits on a phone screen several times over, and
 * the list is newest-first, so the part anybody actually reads is in the first
 * window.
 */
export function Transactions({
  transactions,
  categories,
}: {
  transactions: readonly TransactionRow[];
  categories: readonly CategoryRow[];
}) {
  const { money, locale } = useMoneyFormat();
  const [shown, setShown] = useState(PAGE);
  const nameById = useMemo(
    () => new Map(categories.map((c) => [String(c.id), String(c.name)])),
    [categories],
  );
  const visible = useMemo(() => transactions.slice(0, shown), [transactions, shown]);

  if (transactions.length === 0) {
    return (
      <>
        <PageHeader title="Transactions" description="Everything you have recorded." />
        <EmptyState
          icon={Receipt}
          title="Nothing recorded yet"
          description="Anything you add shows up here, newest first."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        description={
          transactions.length > shown
            ? `${transactions.length} recorded on this device, showing the most recent ${shown}.`
            : `${transactions.length} recorded on this device.`
        }
      />
      <Card>
        <CardContent className="pt-2">
          <ul className="divide-y divide-border" data-testid="transaction-list">
            {visible.map((row) => (
              <Row
                key={String(row.id)}
                row={row}
                label={labelFor(row, nameById)}
                money={money}
                locale={locale}
              />
            ))}
          </ul>

          {transactions.length > shown ? (
            <div className="flex justify-center pb-1 pt-3">
              <Button
                variant="outline"
                onClick={() => setShown((count) => count + PAGE)}
                data-testid="show-more"
              >
                Show {Math.min(PAGE, transactions.length - shown)} more
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
