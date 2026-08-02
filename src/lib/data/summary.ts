import { lastNMonths, type IsoDate } from "@/lib/date";
import type { CategoryTotal, MonthTotals } from "@/lib/domain/metrics";
import { toMinor, type Minor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

/**
 * Monthly aggregates for a window of months, oldest first.
 *
 * Months with no activity come back as explicit zeros rather than gaps, so a
 * twelve-month chart always has twelve points and a quiet month reads as a
 * quiet month instead of a missing one.
 */
export async function getMonthlyTotals(
  anchorMonth: IsoDate,
  monthCount = 12,
): Promise<MonthTotals[]> {
  const months = lastNMonths(anchorMonth, monthCount);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_monthly_summary")
    .select("period_month, total_expense, total_income, income_active, income_passive")
    .gte("period_month", months[0])
    .lte("period_month", months[months.length - 1]);

  if (error) throw new Error(error.message);

  const byMonth = new Map(
    (data ?? []).map((row) => [
      row.period_month,
      {
        periodMonth: row.period_month,
        totalExpense: toMinor(row.total_expense),
        totalIncome: toMinor(row.total_income),
        incomeActive: toMinor(row.income_active),
        incomePassive: toMinor(row.income_passive),
      },
    ]),
  );

  return months.map(
    (month) =>
      byMonth.get(month) ?? {
        periodMonth: month,
        totalExpense: 0,
        totalIncome: 0,
        incomeActive: 0,
        incomePassive: 0,
      },
  );
}

/** Expense totals per category for one month, largest first. */
export async function getCategorySpend(periodMonth: IsoDate): Promise<CategoryTotal[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_category_spend")
    .select("category_id, category_name, category_color, total_amount")
    .eq("period_month", periodMonth);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name ?? "Uncategorised",
      color: row.category_color,
      amount: toMinor(row.total_amount),
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Cash on hand across the accounts marked liquid.
 *
 * A brokerage account holding illiquid positions should not inflate how long
 * you could go without income, which is why `is_liquid` is a property of the
 * account rather than an assumption about its type.
 */
export async function getLiquidBalance(): Promise<Minor> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_account_balances")
    .select("balance")
    .eq("is_liquid", true)
    .eq("is_archived", false);

  if (error) throw new Error(error.message);

  return (data ?? []).reduce((total, row) => total + toMinor(row.balance), 0);
}
