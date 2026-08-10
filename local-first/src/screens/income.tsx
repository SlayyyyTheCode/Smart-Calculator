import { Wallet } from "lucide-react";

import { StatTile } from "@app/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { EmptyState } from "@app/components/ui/empty-state";
import { PageHeader } from "@app/components/ui/page-header";
import { ProgressBar } from "@app/components/ui/progress-bar";
import { fireCoverage } from "@app/lib/domain/metrics";
import { formatDateLabel } from "@app/lib/date";
import { formatMoney } from "@app/lib/money";

import { confirmedTotals } from "../repository";
import type { TransactionRow } from "../db";

const CURRENCY = "SGD";
const LOCALE = "en-SG";

/**
 * Active against passive.
 *
 * The split the brief asked for, and the reason it matters: passive income is
 * the part that keeps arriving when you stop working, so it is measured against
 * spending rather than against total income.
 */
export function Income({
  transactions,
  periodMonth,
}: {
  transactions: readonly TransactionRow[];
  periodMonth: string;
}) {
  const money = (minor: number) => formatMoney(minor, CURRENCY, LOCALE);
  const inMonth = transactions.filter((row) =>
    String(row.occurredOn).slice(0, 7) === periodMonth.slice(0, 7),
  );
  const totals = confirmedTotals(inMonth);
  const total = totals.incomeActive + totals.incomePassive;
  const coverage = fireCoverage(totals.incomePassive, totals.expense);

  const incomeRows = inMonth.filter(
    (row) => String(row.direction) === "income" && String(row.status) === "confirmed",
  );

  if (incomeRows.length === 0) {
    return (
      <>
        <PageHeader title="Income" description="Active and passive, kept apart." />
        <EmptyState
          icon={Wallet}
          title="No income recorded this month"
          description="Record a salary or a dividend and the split appears here."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Income" description="Active and passive, kept apart." />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total income" value={money(total)} hero />
        <StatTile
          label="Active"
          value={money(totals.incomeActive)}
          hint="Salary and anything else you work for."
        />
        <StatTile
          label="Passive"
          value={money(totals.incomePassive)}
          hint="Dividends, coupons, rent — what keeps arriving anyway."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>FIRE coverage</CardTitle>
          <CardDescription>
            How much of this month&rsquo;s spending your passive income already pays for.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold" data-testid="fire">
            {coverage === null ? "—" : `${Math.round(coverage * 100)}%`}
          </p>
          <ProgressBar value={(coverage ?? 0) * 100} className="mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-2">
          <ul className="divide-y divide-border" data-testid="income-list">
            {incomeRows.map((row) => (
              <li key={String(row.id)} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium capitalize">
                    {String(row.incomeType)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateLabel(String(row.occurredOn), LOCALE)}
                  </p>
                </div>
                <span className="tabular text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  +{money(Number(row.amountMinor))}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
