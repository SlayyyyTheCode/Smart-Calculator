/**
 * Presentation shared by the Excel and PDF exports.
 *
 * Both formats describe the same data, so the labels, the totals and the
 * filename convention live here rather than being written twice and drifting.
 */

import { currencySymbol } from "@/lib/currency";
import type { ExportMonth } from "@/lib/data/export";
import type { TransactionListItem } from "@/lib/data/transactions";
import type { IsoDate } from "@/lib/date";
import type { Minor } from "@/lib/money";

export const NATURE_LABEL = {
  daily: "Daily",
  fixed: "Fixed monthly",
  recurring: "Recurring monthly",
} as const;

export const INCOME_TYPE_LABEL = {
  active: "Active",
  passive: "Passive",
} as const;

/** The "Type" column: one word for what kind of money movement this is. */
export function transactionTypeLabel(transaction: TransactionListItem): string {
  if (transaction.direction === "income") {
    return transaction.incomeType ? INCOME_TYPE_LABEL[transaction.incomeType] : "Income";
  }
  return transaction.expenseNature ? NATURE_LABEL[transaction.expenseNature] : "Expense";
}

/** Worksheet name for a month. Excel caps names at 31 chars and bans []:*?/\ */
export function sheetNameForMonth(periodMonth: IsoDate): string {
  return periodMonth.slice(0, 7);
}

/**
 * Download filename. A single-month export says so rather than repeating the
 * month twice.
 */
export function exportFilename(from: IsoDate, to: IsoDate, extension: string): string {
  const start = from.slice(0, 7);
  const end = to.slice(0, 7);
  const range = start === end ? start : `${start}_to_${end}`;
  return `smart-planner-${range}.${extension}`;
}

/**
 * Excel number format for the user's currency, e.g. `"$"#,##0.00`.
 * Written as a format rather than a pre-formatted string so the cells stay
 * numeric and can be summed, charted and re-formatted in Excel.
 */
export function currencyNumberFormat(currency: string, locale: string): string {
  const symbol = currencySymbol(currency, locale).replace(/"/g, "");
  return `"${symbol}"#,##0.00`;
}

export type MonthComputed = {
  /** Confirmed only — drafts are excluded from every total, as on screen. */
  confirmedExpense: Minor;
  confirmedIncome: Minor;
  net: Minor;
  draftCount: number;
  draftTotal: Minor;
};

/**
 * Totals for one exported month, derived from the transactions themselves so
 * the sheet's own rows always add up to its own totals row.
 */
export function computeMonth(month: ExportMonth): MonthComputed {
  let confirmedExpense = 0;
  let confirmedIncome = 0;
  let draftCount = 0;
  let draftTotal = 0;

  for (const transaction of month.transactions) {
    if (transaction.status === "draft") {
      draftCount += 1;
      draftTotal += transaction.amount;
      continue;
    }
    if (transaction.direction === "expense") confirmedExpense += transaction.amount;
    else confirmedIncome += transaction.amount;
  }

  return {
    confirmedExpense,
    confirmedIncome,
    net: confirmedIncome - confirmedExpense,
    draftCount,
    draftTotal,
  };
}

/** Category totals across the whole exported range, largest first. */
export function aggregateCategories(months: ExportMonth[]) {
  const totals = new Map<string, { name: string; amount: Minor; count: number }>();

  for (const month of months) {
    for (const category of month.categorySpend) {
      const key = category.categoryId ?? "uncategorised";
      const existing = totals.get(key);
      if (existing) {
        existing.amount += category.amount;
        existing.count += 1;
      } else {
        totals.set(key, { name: category.categoryName, amount: category.amount, count: 1 });
      }
    }
  }

  return [...totals.entries()]
    .map(([categoryId, value]) => ({ categoryId, ...value }))
    .sort((a, b) => b.amount - a.amount);
}
