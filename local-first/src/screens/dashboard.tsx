import { TrendingUp } from "lucide-react";

import { CategoryBars } from "@app/components/dashboard/category-bars";
import { Meter } from "@app/components/dashboard/meter";
import { StatTile } from "@app/components/dashboard/stat-tile";
import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { EmptyState } from "@app/components/ui/empty-state";
import { PageHeader } from "@app/components/ui/page-header";
import { BUDGET_LEVEL_STYLES, byUrgency } from "@app/lib/domain/budget";
import { formatMoney } from "@app/lib/money";
import { cn } from "@app/lib/utils";

import { budgetStatuses, categoryTotals, monthMetrics } from "../repository";
import type { AccountRow, BudgetRow, CategoryRow, TransactionRow } from "../schema";

const CURRENCY = "SGD";
const LOCALE = "en-SG";

/**
 * The dashboard, rendered from the device's own database.
 *
 * Every component here is the one the deployed app uses — StatTile, Meter,
 * CategoryBars, the budget level styles. Nothing is a local copy, so the two
 * cannot come to look or read differently.
 */
export function Dashboard({
  transactions,
  categories,
  accounts,
  budgets,
  periodMonth,
  onRecord,
}: {
  transactions: readonly TransactionRow[];
  categories: readonly CategoryRow[];
  accounts: readonly AccountRow[];
  budgets: readonly BudgetRow[];
  periodMonth: string;
  onRecord: () => void;
}) {
  const money = (minor: number) => formatMoney(minor, CURRENCY, LOCALE);
  const metrics = monthMetrics(transactions, categories, accounts, periodMonth);
  const totals = metrics.totals;
  const net = totals.incomeActive + totals.incomePassive - totals.expense;

  const warnings = budgetStatuses(budgets, transactions, categories, periodMonth)
    .filter((status) => status.level !== "ok")
    .sort(byUrgency);

  if (transactions.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" description="August 2026 so far." />
        <EmptyState
          icon={TrendingUp}
          title="Nothing to show yet"
          description="Record an expense or two and this page fills in: where your money went, how you are tracking against your budgets, and how much of your spending your passive income covers."
          action={
            <Button onClick={onRecord} data-testid="empty-record">
              Record something
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" description="August 2026 so far." />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Spent this month" value={money(totals.expense)} hero />
        <StatTile
          label="Income this month"
          value={money(totals.incomeActive + totals.incomePassive)}
          hint={`${money(totals.incomeActive)} active · ${money(totals.incomePassive)} passive`}
        />
        <StatTile label="Net this month" value={money(net)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Meter
          label="FIRE coverage"
          ratio={metrics.fireCoverage}
          valueText={
            metrics.fireCoverage === null ? "—" : `${Math.round(metrics.fireCoverage * 100)}%`
          }
          hint="How much of this month's spending your passive income already pays for."
        />
        <Meter
          label="Runway"
          ratio={metrics.runwayMonths === null ? null : Math.min(metrics.runwayMonths / 12, 1)}
          valueText={
            metrics.runwayMonths === null ? "—" : `${metrics.runwayMonths.toFixed(1)} months`
          }
          hint="Liquid balances against your recent monthly spending. Full bar is 12 months."
        />
      </div>

      {warnings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Budget warnings</CardTitle>
            <CardDescription>Most urgent first.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" data-testid="warnings">
              {warnings.map((status) => {
                const style = BUDGET_LEVEL_STYLES[status.level];
                return (
                  <li
                    key={status.budgetId}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                    data-testid={`warning-${status.level}`}
                  >
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                        style.badge,
                      )}
                    >
                      {style.label}
                    </span>
                    <span className="font-medium">{status.categoryName}</span>
                    {/* The badge already says the level; repeating it here
                        would spend the line on a word instead of the figures
                        that tell you how bad it is. */}
                    <span className="text-muted-foreground">
                      {money(status.spent)} of {money(status.limit)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Where the money went</CardTitle>
          <CardDescription>
            {metrics.largest
              ? `${metrics.largest.category.categoryName} is your largest expense this month, ${Math.round(metrics.largest.share * 100)}% of everything you spent.`
              : "No spending recorded yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryBars
            categories={categoryTotals(transactions, categories, periodMonth)}
            currency={CURRENCY}
            locale={LOCALE}
          />
        </CardContent>
      </Card>
    </>
  );
}
