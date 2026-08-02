import type { Metadata } from "next";
import Link from "next/link";
import { Banknote } from "lucide-react";

import { IncomeSplitChart } from "@/components/dashboard/income-split-chart";
import { Meter } from "@/components/dashboard/meter";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getFormatting } from "@/lib/data/profile";
import { getMonthlyTotals } from "@/lib/data/summary";
import { formatMonthLabel, startOfMonth, todayIso } from "@/lib/date";
import { averageMonthlyExpense, fireCoverage } from "@/lib/domain/metrics";
import { formatMoney, formatPercent } from "@/lib/money";

export const metadata: Metadata = { title: "Income" };

export default async function IncomePage() {
  const formatting = await getFormatting();
  const periodMonth = startOfMonth(todayIso(formatting.timezone));
  const months = await getMonthlyTotals(periodMonth, 12);

  const current = months[months.length - 1];
  const money = (minor: number) => formatMoney(minor, formatting.currency, formatting.locale);

  const yearActive = months.reduce((sum, month) => sum + month.incomeActive, 0);
  const yearPassive = months.reduce((sum, month) => sum + month.incomePassive, 0);
  const yearTotal = yearActive + yearPassive;

  // Against average spending rather than this month's, so one unusual month
  // does not swing the headline figure.
  const trailingCoverage = fireCoverage(
    Math.round(yearPassive / months.length),
    averageMonthlyExpense(months),
  );
  const monthCoverage = fireCoverage(current.incomePassive, current.totalExpense);

  const hasIncome = yearTotal > 0;

  return (
    <>
      <PageHeader
        title="Income"
        description="What you earn by working, against what your capital earns for you."
      />

      {!hasIncome ? (
        <EmptyState
          icon={Banknote}
          title="No income recorded yet"
          description="Record your salary as active income and your dividends or bond coupons as passive, and this page tracks how the balance between them shifts."
          action={
            <Link href="/quick-add" className="text-sm text-accent hover:underline">
              Record some income →
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={`Active · ${formatMonthLabel(periodMonth, formatting.locale)}`}
              value={money(current.incomeActive)}
              hint="Salary, wages, bonus"
            />
            <StatTile
              label={`Passive · ${formatMonthLabel(periodMonth, formatting.locale)}`}
              value={money(current.incomePassive)}
              hint="Dividends, coupons, rent received"
            />
            <StatTile
              label="Passive, last 12 months"
              value={money(yearPassive)}
              hint={
                yearTotal > 0
                  ? `${formatPercent(yearPassive / yearTotal, formatting.locale)} of all income`
                  : undefined
              }
            />
            <StatTile label="Active, last 12 months" value={money(yearActive)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Meter
              label="FIRE coverage this month"
              ratio={monthCoverage}
              valueText={
                monthCoverage === null ? "—" : formatPercent(monthCoverage, formatting.locale)
              }
              emptyText="No spending yet"
              hint="Passive income against this month's spending."
            />
            <Meter
              label="FIRE coverage, trailing average"
              ratio={trailingCoverage}
              valueText={
                trailingCoverage === null
                  ? "—"
                  : formatPercent(trailingCoverage, formatting.locale)
              }
              emptyText="Not enough history"
              hint="Average passive income against average spending. The steadier of the two figures."
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Twelve months</CardTitle>
              <CardDescription>
                Stacked, because the two together are your total income.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IncomeSplitChart
                points={months.map((month) => ({
                  periodMonth: month.periodMonth,
                  active: month.incomeActive,
                  passive: month.incomePassive,
                }))}
                currency={formatting.currency}
                locale={formatting.locale}
              />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
