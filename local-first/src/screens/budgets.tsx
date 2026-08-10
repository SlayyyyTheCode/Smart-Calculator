import { useState } from "react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { Field, Input } from "@app/components/ui/field";
import { PageHeader } from "@app/components/ui/page-header";
import { ProgressBar } from "@app/components/ui/progress-bar";
import { BUDGET_LEVEL_STYLES, byUrgency } from "@app/lib/domain/budget";
import { formatMoney, parseAmount, toMajorString } from "@app/lib/money";
import { cn } from "@app/lib/utils";

import { evolu, type AccountRow, type BudgetRow, type CategoryRow, type TransactionRow } from "../db";
import { budgetStatuses } from "../repository";
import { NONE } from "../schema";

const CURRENCY = "SGD";
const LOCALE = "en-SG";

/**
 * Budgets and the warning indicator the brief asked for.
 *
 * The OK / close-to-limit / exceeded call and the colours both come from
 * `@app/lib/domain/budget`. There is one implementation of that rule and this
 * screen is not a second one.
 */
export function Budgets({
  budgets,
  transactions,
  categories,
  periodMonth,
}: {
  budgets: readonly BudgetRow[];
  transactions: readonly TransactionRow[];
  categories: readonly CategoryRow[];
  accounts?: readonly AccountRow[];
  periodMonth: string;
}) {
  const [limit, setLimit] = useState("");
  const [error, setError] = useState<string | null>(null);

  const money = (minor: number) => formatMoney(minor, CURRENCY, LOCALE);
  const statuses = budgetStatuses(budgets, transactions, categories, periodMonth).sort(byUrgency);
  /**
   * This month's overall cap, and only this month's.
   *
   * Matching on the category alone found August's budget while September was on
   * screen, so saving a cap in a new month silently rewrote the old month's
   * figure and the new month never got one — both wrong from one missing
   * condition. Harmless while the clock was frozen, which is exactly why it
   * survived: with the date stuck in August there was only ever one month.
   */
  const overall = budgets.find(
    (budget) =>
      String(budget.categoryId) === NONE &&
      String(budget.periodMonth).slice(0, 7) === periodMonth.slice(0, 7),
  );

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const minor = parseAmount(limit);
    if (minor === null || minor <= 0) {
      setError("Enter a cap greater than zero");
      return;
    }

    const result = overall
      ? evolu.update("budget", { id: overall.id, limitMinor: minor })
      : evolu.insert("budget", {
          periodMonth,
          categoryId: NONE,
          limitMinor: minor,
          warnThresholdPct: 80,
        });

    if (!result.ok) {
      setError(JSON.stringify(result.error));
      return;
    }
    setError(null);
    setLimit("");
  };

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Set what you mean to spend, and get told before you pass it rather than after."
      />

      <Card>
        <CardHeader>
          <CardTitle>This month</CardTitle>
          <CardDescription>
            Amber from 80% of the cap, red once you are past it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cap set yet.</p>
          ) : (
            <ul className="space-y-3" data-testid="budget-list">
              {statuses.map((status) => {
                const style = BUDGET_LEVEL_STYLES[status.level];
                return (
                  <li key={status.budgetId} data-testid={`budget-${status.level}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{status.categoryName}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                          style.badge,
                        )}
                        data-testid="level"
                      >
                        {style.label}
                      </span>
                    </div>
                    <ProgressBar
                      value={status.pctUsed}
                      className="mt-1.5"
                      barClassName={style.bar}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {money(status.spent)} of {money(status.limit)} — {status.pctUsed.toFixed(0)}%
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{overall ? "Change the monthly cap" : "Set a monthly cap"}</CardTitle>
          <CardDescription>
            {overall
              ? `Currently ${money(Number(overall.limitMinor))}.`
              : "One overall cap to start with."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="flex items-end gap-3">
            <Field label="Monthly cap" htmlFor="limit" error={error ?? undefined} className="flex-1">
              <Input
                id="limit"
                inputMode="decimal"
                placeholder={overall ? toMajorString(Number(overall.limitMinor)) : "0.00"}
                className="tabular"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </Field>
            <Button type="submit" data-testid="save-budget">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
