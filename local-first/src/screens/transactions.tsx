import { Trash2 } from "lucide-react";

import { Card, CardContent } from "@app/components/ui/card";
import { EmptyState } from "@app/components/ui/empty-state";
import { PageHeader } from "@app/components/ui/page-header";
import { formatDateLabel } from "@app/lib/date";
import { formatMoney } from "@app/lib/money";
import { cn } from "@app/lib/utils";
import { Receipt } from "lucide-react";

import { evolu, type CategoryRow, type TransactionRow } from "../db";
import { NONE } from "../schema";

const CURRENCY = "SGD";
const LOCALE = "en-SG";

/**
 * Everything recorded, newest first.
 *
 * Drafts are shown but marked, never hidden. A recurring estimate you have not
 * confirmed is still something you are on the hook for; leaving it out of the
 * list while leaving it out of the totals would make it invisible.
 */
export function Transactions({
  transactions,
  categories,
}: {
  transactions: readonly TransactionRow[];
  categories: readonly CategoryRow[];
}) {
  const money = (minor: number) => formatMoney(minor, CURRENCY, LOCALE);
  const nameById = new Map(categories.map((c) => [String(c.id), String(c.name)]));

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
        description={`${transactions.length} recorded on this device.`}
      />
      <Card>
        <CardContent className="pt-2">
          <ul className="divide-y divide-border" data-testid="transaction-list">
            {transactions.map((row) => {
              const isExpense = String(row.direction) === "expense";
              const isDraft = String(row.status) === "draft";
              const categoryId = String(row.categoryId);
              return (
                <li key={String(row.id)} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    {/*
                      A category when there is one, otherwise whatever the row
                      calls itself. An imported statement arrives uncategorised,
                      and a list of thirty rows all reading "Uncategorised" is a
                      list you cannot use — the merchant is the only thing
                      distinguishing the coffee from the rent.
                    */}
                    <p className="truncate text-sm font-medium">
                      {categoryId !== NONE
                        ? (nameById.get(categoryId) ?? "Unknown")
                        : String(row.merchant) !== NONE
                          ? String(row.merchant)
                          : String(row.note) !== NONE
                            ? String(row.note)
                            : "Uncategorised"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateLabel(String(row.occurredOn), LOCALE)}
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
            })}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
