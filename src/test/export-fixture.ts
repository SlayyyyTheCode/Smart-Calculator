/**
 * A realistic export payload, used by the export tests and by the script that
 * writes sample files out to look at. Deliberately awkward: a month with
 * drafts, an exceeded budget, a month with nothing in it, and both income
 * types.
 */

import type { ExportMonth, ExportPayload } from "@/lib/data/export";
import type { TransactionListItem } from "@/lib/data/transactions";
import { evaluateBudget } from "@/lib/domain/budget";

function transaction(
  id: string,
  overrides: Partial<TransactionListItem> = {},
): TransactionListItem {
  return {
    id,
    occurredOn: "2026-01-04",
    amount: 4_250,
    direction: "expense",
    incomeType: null,
    expenseNature: "daily",
    status: "confirmed",
    merchant: "Kopitiam",
    note: null,
    tags: [],
    categoryId: "food",
    categoryName: "Food & Dining",
    categoryColor: "#ef4444",
    accountId: "bank",
    accountName: "DBS Multiplier",
    recurringRuleId: null,
    receiptPath: null,
    ...overrides,
  };
}

const january: ExportMonth = {
  periodMonth: "2026-01-01",
  totals: {
    periodMonth: "2026-01-01",
    totalExpense: 341_250,
    totalIncome: 612_000,
    incomeActive: 550_000,
    incomePassive: 62_000,
  },
  transactions: [
    transaction("t1"),
    transaction("t2", { id: "t2", occurredOn: "2026-01-05", amount: 8_900, merchant: "NTUC", categoryId: "groceries", categoryName: "Groceries" }),
    transaction("t3", {
      id: "t3",
      occurredOn: "2026-01-01",
      amount: 250_000,
      expenseNature: "fixed",
      categoryId: "housing",
      categoryName: "Housing",
      merchant: null,
      note: "Rent",
      recurringRuleId: "rule-rent",
    }),
    transaction("t4", {
      id: "t4",
      occurredOn: "2026-01-01",
      amount: 12_000,
      expenseNature: "recurring",
      status: "draft",
      categoryId: "utilities",
      categoryName: "Utilities",
      merchant: null,
      note: "Electricity",
      recurringRuleId: "rule-power",
    }),
    transaction("t5", {
      id: "t5",
      occurredOn: "2026-01-25",
      amount: 550_000,
      direction: "income",
      incomeType: "active",
      expenseNature: null,
      categoryId: "salary",
      categoryName: "Salary",
      merchant: null,
      note: "Monthly salary",
      tags: ["payday"],
    }),
    transaction("t6", {
      id: "t6",
      occurredOn: "2026-01-28",
      amount: 62_000,
      direction: "income",
      incomeType: "passive",
      expenseNature: null,
      categoryId: "dividends",
      categoryName: "Dividends",
      merchant: null,
      note: "Q4 dividend",
    }),
    transaction("t7", {
      id: "t7",
      occurredOn: "2026-01-18",
      amount: 78_350,
      categoryId: "food",
      categoryName: "Food & Dining",
      merchant: "Restaurant with a rather long name, Ltd",
      note: "Birthday dinner for the whole extended family",
      tags: ["celebration", "reimbursable"],
    }),
  ],
  budgets: [
    {
      budgetId: "b1",
      categoryId: "food",
      categoryName: "Food & Dining",
      categoryColor: "#ef4444",
      periodMonth: "2026-01-01",
      // Deliberately blown, so the red path is exercised.
      evaluation: evaluateBudget({ spent: 82_600, limit: 60_000, warnThresholdPct: 80 }),
    },
    {
      budgetId: "b2",
      categoryId: "groceries",
      categoryName: "Groceries",
      categoryColor: "#f97316",
      periodMonth: "2026-01-01",
      evaluation: evaluateBudget({ spent: 8_900, limit: 40_000, warnThresholdPct: 80 }),
    },
    {
      budgetId: "b3",
      categoryId: null,
      categoryName: "Everything",
      categoryColor: null,
      periodMonth: "2026-01-01",
      // Sits in the amber band.
      evaluation: evaluateBudget({ spent: 341_250, limit: 400_000, warnThresholdPct: 80 }),
    },
  ],
  categorySpend: [
    { categoryId: "housing", categoryName: "Housing", amount: 250_000 },
    { categoryId: "food", categoryName: "Food & Dining", amount: 82_600 },
    { categoryId: "groceries", categoryName: "Groceries", amount: 8_900 },
  ],
};

const february: ExportMonth = {
  periodMonth: "2026-02-01",
  totals: {
    periodMonth: "2026-02-01",
    totalExpense: 0,
    totalIncome: 0,
    incomeActive: 0,
    incomePassive: 0,
  },
  transactions: [],
  budgets: [],
  categorySpend: [],
};

export const EXPORT_FIXTURE: ExportPayload = {
  from: "2026-01-01",
  to: "2026-02-01",
  currency: "SGD",
  locale: "en-SG",
  timezone: "Asia/Singapore",
  displayName: "Ben",
  generatedAt: "2026-03-01T09:30:00.000Z",
  months: [january, february],
};
