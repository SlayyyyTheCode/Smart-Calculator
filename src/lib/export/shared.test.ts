import { describe, expect, it } from "vitest";

import type { ExportMonth } from "@/lib/data/export";
import type { TransactionListItem } from "@/lib/data/transactions";
import {
  aggregateCategories,
  computeMonth,
  currencyNumberFormat,
  exportFilename,
  sheetNameForMonth,
  transactionTypeLabel,
} from "@/lib/export/shared";

function transaction(overrides: Partial<TransactionListItem> = {}): TransactionListItem {
  return {
    id: "t1",
    occurredOn: "2026-03-04",
    amount: 10_000,
    direction: "expense",
    incomeType: null,
    expenseNature: "daily",
    status: "confirmed",
    merchant: null,
    note: null,
    tags: [],
    categoryId: "c1",
    categoryName: "Groceries",
    categoryColor: "#f97316",
    accountId: "a1",
    accountName: "Bank",
    recurringRuleId: null,
    ...overrides,
  };
}

function month(transactions: TransactionListItem[]): ExportMonth {
  return {
    periodMonth: "2026-03-01",
    totals: {
      periodMonth: "2026-03-01",
      totalExpense: 0,
      totalIncome: 0,
      incomeActive: 0,
      incomePassive: 0,
    },
    transactions,
    budgets: [],
    categorySpend: [],
  };
}

describe("sheetNameForMonth", () => {
  it("is the YYYY-MM the user asked for, and legal as a worksheet name", () => {
    const name = sheetNameForMonth("2026-01-01");
    expect(name).toBe("2026-01");
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:*?/\\]/);
  });
});

describe("exportFilename", () => {
  it("names a range", () => {
    expect(exportFilename("2026-01-01", "2026-08-01", "xlsx")).toBe(
      "smart-planner-2026-01_to_2026-08.xlsx",
    );
  });

  it("does not repeat a single month", () => {
    expect(exportFilename("2026-03-01", "2026-03-01", "pdf")).toBe("smart-planner-2026-03.pdf");
  });
});

describe("currencyNumberFormat", () => {
  it("wraps the locale's own symbol", () => {
    expect(currencyNumberFormat("SGD", "en-SG")).toBe('"$"#,##0.00');
    expect(currencyNumberFormat("EUR", "de-DE")).toBe('"€"#,##0.00');
  });

  it("never emits an unbalanced quote that would corrupt the format string", () => {
    expect(currencyNumberFormat("USD", "en-US").split('"')).toHaveLength(3);
  });
});

describe("transactionTypeLabel", () => {
  it("names the expense nature", () => {
    expect(transactionTypeLabel(transaction({ expenseNature: "fixed" }))).toBe("Fixed monthly");
    expect(transactionTypeLabel(transaction({ expenseNature: "recurring" }))).toBe(
      "Recurring monthly",
    );
    expect(transactionTypeLabel(transaction({ expenseNature: "daily" }))).toBe("Daily");
  });

  it("names the income type", () => {
    const income = transaction({
      direction: "income",
      incomeType: "passive",
      expenseNature: null,
    });
    expect(transactionTypeLabel(income)).toBe("Passive");
  });
});

describe("computeMonth", () => {
  it("totals confirmed entries only", () => {
    const computed = computeMonth(
      month([
        transaction({ id: "a", amount: 10_000 }),
        transaction({ id: "b", amount: 5_000 }),
        transaction({
          id: "c",
          direction: "income",
          incomeType: "active",
          expenseNature: null,
          amount: 100_000,
        }),
      ]),
    );

    expect(computed.confirmedExpense).toBe(15_000);
    expect(computed.confirmedIncome).toBe(100_000);
    expect(computed.net).toBe(85_000);
  });

  it("keeps drafts out of the totals and counts them separately", () => {
    const computed = computeMonth(
      month([
        transaction({ id: "a", amount: 10_000 }),
        transaction({ id: "b", amount: 7_000, status: "draft" }),
        transaction({ id: "c", amount: 3_000, status: "draft" }),
      ]),
    );

    expect(computed.confirmedExpense).toBe(10_000);
    expect(computed.draftCount).toBe(2);
    expect(computed.draftTotal).toBe(10_000);
    expect(computed.net).toBe(-10_000);
  });

  it("is all zeros for an empty month", () => {
    expect(computeMonth(month([]))).toEqual({
      confirmedExpense: 0,
      confirmedIncome: 0,
      net: 0,
      draftCount: 0,
      draftTotal: 0,
    });
  });
});

describe("aggregateCategories", () => {
  it("sums a category across months and ranks it", () => {
    const build = (periodMonth: string, spend: { id: string; name: string; amount: number }[]) => ({
      ...month([]),
      periodMonth,
      categorySpend: spend.map((item) => ({
        categoryId: item.id,
        categoryName: item.name,
        amount: item.amount,
      })),
    });

    const result = aggregateCategories([
      build("2026-01-01", [
        { id: "food", name: "Food", amount: 30_000 },
        { id: "rent", name: "Rent", amount: 100_000 },
      ]),
      build("2026-02-01", [
        { id: "food", name: "Food", amount: 40_000 },
        { id: "rent", name: "Rent", amount: 100_000 },
      ]),
    ]);

    expect(result[0]).toMatchObject({ categoryId: "rent", amount: 200_000, count: 2 });
    expect(result[1]).toMatchObject({ categoryId: "food", amount: 70_000, count: 2 });
  });

  it("groups uncategorised spend under one key", () => {
    const result = aggregateCategories([
      {
        ...month([]),
        categorySpend: [{ categoryId: null, categoryName: "Uncategorised", amount: 500 }],
      },
      {
        ...month([]),
        categorySpend: [{ categoryId: null, categoryName: "Uncategorised", amount: 700 }],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1_200);
  });
});
