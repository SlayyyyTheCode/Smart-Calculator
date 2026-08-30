import { evaluateBudget, type BudgetEvaluation } from "@app/lib/domain/budget";
import type { IncomeType } from "@app/lib/domain/enums";
import {
  fireCoverage,
  largestExpense,
  runwayMonths,
  savingsRate,
  type CategoryTotal,
  type LargestExpense,
} from "@app/lib/domain/metrics";
import type { Minor } from "@app/lib/money";

import { NONE } from "./schema";
import { type AccountRow, type BudgetRow, type CategoryRow, type TransactionRow } from "./db";

/**
 * The bridge between rows on the device and the rules.
 *
 * Everything below is shaping: pulling plain values out of Evolu's branded row
 * types and handing them to functions that already exist. No rule is
 * reimplemented here, which is the whole point — `evaluateBudget`,
 * `largestExpense`, `savingsRate`, `fireCoverage` and `runwayMonths` are
 * imported from the app that ships today and used unchanged. A figure cannot
 * mean one thing on the phone and another on the web, because there is only one
 * implementation of each.
 */

const num = (value: unknown): number => Number(value ?? 0);
const str = (value: unknown): string => String(value ?? "");
const sameMonth = (isoDate: unknown, periodMonth: string) =>
  str(isoDate).slice(0, 7) === periodMonth.slice(0, 7);

export type ConfirmedTotals = {
  expense: Minor;
  incomeActive: Minor;
  incomePassive: Minor;
  /** Employee CPF deducted from salary in the period. */
  cpf: Minor;
  /** Income less that CPF: what actually reached a bank account. */
  takeHome: Minor;
};

/**
 * Drafts are excluded from every total. A recurring estimate is a forecast, and
 * counting a forecast as spending is how a budget silently lies.
 */
export function confirmedTotals(transactions: readonly TransactionRow[]): ConfirmedTotals {
  let expense = 0;
  let incomeActive = 0;
  let incomePassive = 0;
  let cpf = 0;

  for (const row of transactions) {
    if (str(row.status) !== "confirmed") continue;
    const amount = num(row.amountMinor);
    if (str(row.direction) === "expense") {
      expense += amount;
    } else if ((str(row.incomeType) as IncomeType) === "passive") {
      incomePassive += amount;
    } else {
      incomeActive += amount;
      // Read off the row rather than recomputed. The contribution is a fact
      // about that payment; recomputing it would restate an old payslip under
      // today's age band.
      cpf += num(row.cpfMinor);
    }
  }

  return {
    expense,
    incomeActive,
    incomePassive,
    cpf,
    takeHome: incomeActive + incomePassive - cpf,
  };
}

/**
 * Confirmed expense per category between two dates, inclusive.
 *
 * The same shaping as the monthly version and the same exclusions — drafts and
 * income are not spending — but over an arbitrary range, because "where did it
 * go" is a question people ask of a week, a quarter and a decade, not only of a
 * calendar month.
 */
export function categoryTotalsInRange(
  transactions: readonly TransactionRow[],
  categories: readonly CategoryRow[],
  from: string,
  to: string,
): CategoryTotal[] {
  return shapeTotals(transactions, categories, (row) => {
    const on = str(row.occurredOn);
    return on >= from && on <= to;
  });
}

/** Confirmed expense per category for a month, shaped for the metrics module. */
export function categoryTotals(
  transactions: readonly TransactionRow[],
  categories: readonly CategoryRow[],
  periodMonth: string,
): CategoryTotal[] {
  return shapeTotals(transactions, categories, (row) => sameMonth(row.occurredOn, periodMonth));
}

function shapeTotals(
  transactions: readonly TransactionRow[],
  categories: readonly CategoryRow[],
  within: (row: TransactionRow) => boolean,
): CategoryTotal[] {
  const nameById = new Map(categories.map((c) => [str(c.id), str(c.name)]));
  const byCategory = new Map<string, Minor>();

  for (const row of transactions) {
    if (str(row.status) !== "confirmed" || str(row.direction) !== "expense") continue;
    if (!within(row)) continue;
    const key = str(row.categoryId);
    byCategory.set(key, (byCategory.get(key) ?? 0) + num(row.amountMinor));
  }

  return (
    [...byCategory]
      .map(([categoryId, amount]) => ({
        categoryId: categoryId === NONE ? null : categoryId,
        categoryName: categoryId === NONE ? "Uncategorised" : (nameById.get(categoryId) ?? "Unknown"),
        amount,
      }))
      // Ranked biggest first, which is what "where did the money go" means and
      // what CategoryBars needs in order to emphasise the right row.
      .sort((a, b) => b.amount - a.amount)
  );
}

export type LocalBudgetStatus = BudgetEvaluation & {
  budgetId: string;
  categoryName: string;
};

/**
 * Budget status for a month.
 *
 * The OK / warning / exceeded call is `evaluateBudget`'s, the same single
 * implementation the Postgres version uses.
 */
export function budgetStatuses(
  budgets: readonly BudgetRow[],
  transactions: readonly TransactionRow[],
  categories: readonly CategoryRow[],
  periodMonth: string,
): LocalBudgetStatus[] {
  const totals = categoryTotals(transactions, categories, periodMonth);
  const spentByCategory = new Map(totals.map((t) => [t.categoryId ?? NONE, t.amount]));
  const overallSpend = totals.reduce((sum, t) => sum + t.amount, 0);
  const nameById = new Map(categories.map((c) => [str(c.id), str(c.name)]));

  return budgets
    .filter((budget) => sameMonth(budget.periodMonth, periodMonth))
    .map((budget) => {
      const categoryId = str(budget.categoryId);
      const spent = categoryId === NONE ? overallSpend : (spentByCategory.get(categoryId) ?? 0);
      return {
        budgetId: str(budget.id),
        categoryName: categoryId === NONE ? "Overall" : (nameById.get(categoryId) ?? "Unknown"),
        ...evaluateBudget({
          limit: num(budget.limitMinor),
          spent,
          warnThresholdPct: num(budget.warnThresholdPct),
        }),
      };
    });
}

/** Balance per account: opening balance, plus confirmed income, less confirmed expenses. */
export function accountBalances(
  accounts: readonly AccountRow[],
  transactions: readonly TransactionRow[],
): Map<string, Minor> {
  const balances = new Map<string, Minor>(
    accounts.map((account) => [str(account.id), num(account.openingBalanceMinor)]),
  );

  for (const row of transactions) {
    if (str(row.status) !== "confirmed") continue;
    const accountId = str(row.accountId);
    if (!balances.has(accountId)) continue;
    const delta = str(row.direction) === "expense" ? -num(row.amountMinor) : num(row.amountMinor);
    balances.set(accountId, (balances.get(accountId) ?? 0) + delta);
  }

  return balances;
}

export type LocalMetrics = {
  totals: ConfirmedTotals;
  savingsRate: number | null;
  fireCoverage: number | null;
  runwayMonths: number | null;
  largest: LargestExpense | null;
};

/** The dashboard's derived figures, all from the shipped metrics module. */
export function monthMetrics(
  transactions: readonly TransactionRow[],
  categories: readonly CategoryRow[],
  accounts: readonly AccountRow[],
  periodMonth: string,
): LocalMetrics {
  const inMonth = transactions.filter((row) => sameMonth(row.occurredOn, periodMonth));
  const totals = confirmedTotals(inMonth);
  const income = totals.incomeActive + totals.incomePassive;

  const balances = accountBalances(accounts, transactions);
  const liquidTotal = accounts
    .filter((account) => num(account.isLiquid) === 1)
    .reduce((sum, account) => sum + (balances.get(str(account.id)) ?? 0), 0);

  return {
    totals,
    savingsRate: savingsRate(income, totals.expense),
    fireCoverage: fireCoverage(totals.incomePassive, totals.expense),
    // This month is the only history here, so it is also the average.
    runwayMonths: runwayMonths(liquidTotal, totals.expense),
    largest: largestExpense(categoryTotals(inMonth, categories, periodMonth)),
  };
}
