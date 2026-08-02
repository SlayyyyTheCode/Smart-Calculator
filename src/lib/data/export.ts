import { listBudgetStatus, type BudgetStatus } from "@/lib/data/budgets";
import { getFormatting, getProfile } from "@/lib/data/profile";
import { getCategorySpend, getMonthlyTotals } from "@/lib/data/summary";
import type { TransactionListItem } from "@/lib/data/transactions";
import { endOfMonth, monthsBetween, startOfMonth, type IsoDate } from "@/lib/date";
import type { CategoryTotal, MonthTotals } from "@/lib/domain/metrics";
import { toMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type {
  ExpenseNature,
  IncomeType,
  TransactionDirection,
  TransactionStatus,
} from "@/types/database";

export type ExportMonth = {
  periodMonth: IsoDate;
  totals: MonthTotals;
  transactions: TransactionListItem[];
  budgets: BudgetStatus[];
  categorySpend: CategoryTotal[];
};

export type ExportPayload = {
  from: IsoDate;
  to: IsoDate;
  currency: string;
  locale: string;
  timezone: string;
  displayName: string | null;
  generatedAt: string;
  months: ExportMonth[];
};

const SELECT = `
  id, occurred_on, amount, direction, income_type, expense_nature, status,
  merchant, note, tags, category_id, account_id, recurring_rule_id,
  category:categories ( id, name, color ),
  account:accounts ( id, name )
`;

type JoinedRow = {
  id: string;
  occurred_on: string;
  amount: number | string;
  direction: TransactionDirection;
  income_type: IncomeType | null;
  expense_nature: ExpenseNature | null;
  status: TransactionStatus;
  merchant: string | null;
  note: string | null;
  tags: string[] | null;
  category_id: string | null;
  account_id: string | null;
  recurring_rule_id: string | null;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string } | null;
};

/**
 * Everything an export needs, for a range of whole months.
 *
 * Drafts are included in the transaction listing with their status shown, so an
 * export is a complete record of what is in the app — but they are excluded
 * from every total, exactly as they are on screen. An export that quietly
 * disagreed with the dashboard would be worse than no export.
 */
export async function getExportPayload(from: IsoDate, to: IsoDate): Promise<ExportPayload> {
  const months = monthsBetween(from, to);
  if (months.length === 0) {
    throw new Error("The end month must not be before the start month.");
  }

  const rangeStart = months[0];
  const rangeEnd = endOfMonth(months[months.length - 1]);

  const supabase = await createClient();
  const [formatting, profile, monthlyTotals] = await Promise.all([
    getFormatting(),
    getProfile(),
    // getMonthlyTotals works backwards from an anchor, so ask for the window
    // ending at the last month of the range.
    getMonthlyTotals(months[months.length - 1], months.length),
  ]);

  const { data, error } = await supabase
    .from("transactions")
    .select(SELECT)
    .gte("occurred_on", rangeStart)
    .lte("occurred_on", rangeEnd)
    .order("occurred_on", { ascending: true });

  if (error) throw new Error(error.message);

  const transactions = ((data as unknown as JoinedRow[] | null) ?? []).map<TransactionListItem>(
    (row) => ({
      id: row.id,
      occurredOn: row.occurred_on,
      amount: toMinor(row.amount),
      direction: row.direction,
      incomeType: row.income_type,
      expenseNature: row.expense_nature,
      status: row.status,
      merchant: row.merchant,
      note: row.note,
      tags: row.tags ?? [],
      categoryId: row.category_id,
      categoryName: row.category?.name ?? null,
      categoryColor: row.category?.color ?? null,
      accountId: row.account_id,
      accountName: row.account?.name ?? null,
      recurringRuleId: row.recurring_rule_id,
    }),
  );

  const byMonth = new Map<string, TransactionListItem[]>();
  for (const transaction of transactions) {
    const key = startOfMonth(transaction.occurredOn);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(transaction);
    else byMonth.set(key, [transaction]);
  }

  const totalsByMonth = new Map(monthlyTotals.map((total) => [total.periodMonth, total]));

  // Budgets and category spend are per-month views, so they are fetched per
  // month. Ranges are whole months and typically a year at most.
  const perMonth = await Promise.all(
    months.map(async (periodMonth) => {
      const [budgets, categorySpend] = await Promise.all([
        listBudgetStatus(periodMonth),
        getCategorySpend(periodMonth),
      ]);

      return {
        periodMonth,
        totals: totalsByMonth.get(periodMonth) ?? {
          periodMonth,
          totalExpense: 0,
          totalIncome: 0,
          incomeActive: 0,
          incomePassive: 0,
        },
        transactions: byMonth.get(periodMonth) ?? [],
        budgets,
        categorySpend,
      };
    }),
  );

  return {
    from: rangeStart,
    to: months[months.length - 1],
    currency: formatting.currency,
    locale: formatting.locale,
    timezone: formatting.timezone,
    displayName: profile?.display_name ?? null,
    generatedAt: new Date().toISOString(),
    months: perMonth,
  };
}
