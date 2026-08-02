/**
 * Derived financial metrics.
 *
 * Pure functions over already-aggregated numbers — no database access, no
 * formatting. Everything takes and returns minor units or plain ratios so the
 * same code can serve the dashboard, the PDF report and the Excel summary.
 */

import type { Minor } from "@/lib/money";

export type MonthTotals = {
  periodMonth: string;
  totalExpense: Minor;
  totalIncome: Minor;
  incomeActive: Minor;
  incomePassive: Minor;
};

/**
 * FIRE coverage: what share of your spending your passive income already pays
 * for. 1.0 means dividends and coupons alone cover your life.
 *
 * Returns null when there were no expenses — the ratio is undefined, and
 * showing "infinite coverage" for a month with no spending is noise, not signal.
 */
export function fireCoverage(passiveIncome: Minor, totalExpense: Minor): number | null {
  if (totalExpense <= 0) return null;
  return passiveIncome / totalExpense;
}

/**
 * Savings rate: the share of income you did not spend. Negative when you
 * outspent your income, which is the number worth seeing.
 */
export function savingsRate(totalIncome: Minor, totalExpense: Minor): number | null {
  if (totalIncome <= 0) return null;
  return (totalIncome - totalExpense) / totalIncome;
}

/**
 * Runway: how many months your liquid cash covers at your recent burn rate.
 * Uses an average of recent months rather than the latest one so a single
 * holiday does not halve the figure.
 */
export function runwayMonths(liquidBalance: Minor, averageMonthlyExpense: Minor): number | null {
  if (averageMonthlyExpense <= 0) return null;
  if (liquidBalance <= 0) return 0;
  return liquidBalance / averageMonthlyExpense;
}

/** Mean expense across the given months, ignoring months with no data. */
export function averageMonthlyExpense(months: MonthTotals[]): Minor {
  const withSpend = months.filter((m) => m.totalExpense > 0);
  if (withSpend.length === 0) return 0;
  const total = withSpend.reduce((sum, m) => sum + m.totalExpense, 0);
  return Math.round(total / withSpend.length);
}

export type CategoryTotal = {
  categoryId: string | null;
  categoryName: string;
  color?: string | null;
  amount: Minor;
};

export type LargestExpense = {
  category: CategoryTotal;
  /** Share of the month's total spend, 0-1. */
  share: number;
  /** Change against the previous month as a ratio; null with no prior data. */
  changeVsPrevious: number | null;
};

/**
 * The biggest spending category for a month, with its share of the total and
 * how it moved against last month. This is the "where is your largest expense"
 * answer the dashboard leads with.
 */
export function largestExpense(
  current: CategoryTotal[],
  previous: CategoryTotal[] = [],
): LargestExpense | null {
  if (current.length === 0) return null;

  const top = current.reduce((max, item) => (item.amount > max.amount ? item : max));
  if (top.amount <= 0) return null;

  const monthTotal = current.reduce((sum, item) => sum + item.amount, 0);
  const prior = previous.find((item) => item.categoryId === top.categoryId);

  return {
    category: top,
    share: monthTotal > 0 ? top.amount / monthTotal : 0,
    changeVsPrevious:
      prior && prior.amount > 0 ? (top.amount - prior.amount) / prior.amount : null,
  };
}

/** Month-over-month change for any pair of totals. Null when there is no base. */
export function changeRatio(current: Minor, previous: Minor): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export type DashboardMetrics = {
  totalExpense: Minor;
  totalIncome: Minor;
  incomeActive: Minor;
  incomePassive: Minor;
  netCashflow: Minor;
  savingsRate: number | null;
  fireCoverage: number | null;
  runwayMonths: number | null;
  expenseChange: number | null;
};

/** Rolls the month's aggregates into the tiles shown across the top of the dashboard. */
export function buildDashboardMetrics(
  current: MonthTotals,
  previous: MonthTotals | undefined,
  trailingMonths: MonthTotals[],
  liquidBalance: Minor,
): DashboardMetrics {
  return {
    totalExpense: current.totalExpense,
    totalIncome: current.totalIncome,
    incomeActive: current.incomeActive,
    incomePassive: current.incomePassive,
    netCashflow: current.totalIncome - current.totalExpense,
    savingsRate: savingsRate(current.totalIncome, current.totalExpense),
    fireCoverage: fireCoverage(current.incomePassive, current.totalExpense),
    runwayMonths: runwayMonths(liquidBalance, averageMonthlyExpense(trailingMonths)),
    expenseChange: previous ? changeRatio(current.totalExpense, previous.totalExpense) : null,
  };
}
