import type { Metadata } from "next";
import Link from "next/link";
import { Plus, TrendingUp } from "lucide-react";

import { BudgetStatusList } from "@/components/budgets/budget-status-list";
import { CategoryBars } from "@/components/dashboard/category-bars";
import { Meter } from "@/components/dashboard/meter";
import { StatTile } from "@/components/dashboard/stat-tile";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listBudgetStatus } from "@/lib/data/budgets";
import { getFormatting } from "@/lib/data/profile";
import { countPendingDrafts } from "@/lib/data/recurring";
import { getCategorySpend, getLiquidBalance, getMonthlyTotals } from "@/lib/data/summary";
import { addMonths, formatMonthLabel, startOfMonth, todayIso } from "@/lib/date";
import { buildDashboardMetrics, largestExpense } from "@/lib/domain/metrics";
import { formatMoney, formatPercent } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const formatting = await getFormatting();
  const today = todayIso(formatting.timezone);
  const periodMonth = startOfMonth(today);

  const [months, categorySpend, previousCategorySpend, liquidBalance, budgetStatuses, draftCount] =
    await Promise.all([
      getMonthlyTotals(periodMonth, 12),
      getCategorySpend(periodMonth),
      getCategorySpend(addMonths(periodMonth, -1)),
      getLiquidBalance(),
      listBudgetStatus(periodMonth),
      countPendingDrafts(),
    ]);

  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const metrics = buildDashboardMetrics(current, previous, months, liquidBalance);
  const top = largestExpense(categorySpend, previousCategorySpend);

  const hasActivity = months.some(
    (month) => month.totalExpense > 0 || month.totalIncome > 0,
  );

  const money = (minor: number) => formatMoney(minor, formatting.currency, formatting.locale);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${formatMonthLabel(periodMonth, formatting.locale)} so far.`}
        actions={
          <Link href="/quick-add">
            <Button size="sm">
              <Plus aria-hidden />
              Add
            </Button>
          </Link>
        }
      />

      {!hasActivity ? (
        <EmptyState
          icon={TrendingUp}
          title="Nothing to show yet"
          description="Record an expense or two and this page fills in: where your money went, how you are tracking against your budgets, and how much of your spending your passive income covers."
          action={
            <Link href="/quick-add">
              <Button size="sm">
                <Plus aria-hidden />
                Record something
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {draftCount > 0 ? (
            <Link
              href="/transactions?status=draft&month=all"
              className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm transition-colors hover:bg-amber-500/15"
            >
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {draftCount} {draftCount === 1 ? "draft needs" : "drafts need"} a real amount
              </span>
              <span className="text-muted-foreground">
                — forecast from your recurring rules, and left out of these totals until
                confirmed.
              </span>
            </Link>
          ) : null}

          {/* The one number the page leads with. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <StatTile
                hero
                label="Spent this month"
                value={money(metrics.totalExpense)}
                delta={
                  metrics.expenseChange === null
                    ? null
                    : {
                        text: `${formatPercent(Math.abs(metrics.expenseChange), formatting.locale)} vs last month`,
                        direction: metrics.expenseChange > 0 ? "up" : metrics.expenseChange < 0 ? "down" : "flat",
                        // Spending more is not the good direction.
                        isGood: metrics.expenseChange < 0,
                      }
                }
              />
            </div>

            <StatTile
              label="Income this month"
              value={money(metrics.totalIncome)}
              hint={`${money(metrics.incomeActive)} active · ${money(metrics.incomePassive)} passive`}
            />

            <StatTile
              label="Net this month"
              value={money(metrics.netCashflow)}
              delta={
                metrics.savingsRate === null
                  ? null
                  : {
                      text: `${formatPercent(metrics.savingsRate, formatting.locale)} of income kept`,
                      direction: metrics.savingsRate >= 0 ? "up" : "down",
                      isGood: metrics.savingsRate >= 0,
                    }
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Meter
              label="FIRE coverage"
              ratio={metrics.fireCoverage}
              valueText={
                metrics.fireCoverage === null
                  ? "—"
                  : formatPercent(metrics.fireCoverage, formatting.locale)
              }
              emptyText="No spending yet"
              hint="How much of this month's spending your passive income already pays for."
            />

            <Meter
              label="Runway"
              ratio={metrics.runwayMonths === null ? null : metrics.runwayMonths / 12}
              valueText={
                metrics.runwayMonths === null
                  ? "—"
                  : `${metrics.runwayMonths.toFixed(1)} months`
              }
              emptyText="Not enough history"
              hint={`${money(liquidBalance)} liquid, against your recent monthly spending. Full bar is 12 months.`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Where the money went</CardTitle>
                <CardDescription>
                  {top
                    ? `${top.category.categoryName} is your largest expense this month, ${formatPercent(top.share, formatting.locale)} of everything you spent${
                        top.changeVsPrevious === null
                          ? ""
                          : `, ${formatPercent(Math.abs(top.changeVsPrevious), formatting.locale)} ${top.changeVsPrevious >= 0 ? "up on" : "down on"} last month`
                      }.`
                    : "Nothing recorded this month yet."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {categorySpend.length > 0 ? (
                  <CategoryBars
                    categories={categorySpend}
                    currency={formatting.currency}
                    locale={formatting.locale}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No expenses recorded for this month.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Twelve months</CardTitle>
                <CardDescription>
                  Income against spending. Both are in {formatting.currency}, so they share one
                  scale.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart
                  points={months.map((month) => ({
                    periodMonth: month.periodMonth,
                    expense: month.totalExpense,
                    income: month.totalIncome,
                  }))}
                  currency={formatting.currency}
                  locale={formatting.locale}
                />
              </CardContent>
            </Card>
          </div>

          {budgetStatuses.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Budgets</CardTitle>
                <CardDescription>
                  {budgetStatuses.some((status) => status.evaluation.level !== "ok")
                    ? "The ones needing attention are first."
                    : "Everything is inside its limit."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BudgetStatusList
                  statuses={budgetStatuses.slice(0, 5)}
                  currency={formatting.currency}
                  locale={formatting.locale}
                />
                {budgetStatuses.length > 5 ? (
                  <Link
                    href="/budgets"
                    className="mt-3 inline-block text-sm text-accent hover:underline"
                  >
                    See all {budgetStatuses.length} budgets →
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No budgets set</CardTitle>
                <CardDescription>
                  Set a monthly cap per category and this page starts warning you before you go
                  over rather than after.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/budgets">
                  <Button size="sm" variant="outline">
                    Set budgets
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}
