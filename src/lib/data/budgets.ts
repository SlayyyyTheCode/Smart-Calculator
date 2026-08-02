import {
  byUrgency,
  evaluateBudget,
  type BudgetEvaluation,
} from "@/lib/domain/budget";
import { toMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { IsoDate } from "@/lib/date";

export type BudgetStatus = {
  budgetId: string;
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  periodMonth: IsoDate;
  evaluation: BudgetEvaluation;
};

/**
 * Budgets for a month with what has actually been spent against each.
 *
 * The view supplies the arithmetic; the OK / close / exceeded call is made here
 * by evaluateBudget, which is the only place that decision is implemented.
 */
export async function listBudgetStatus(periodMonth: IsoDate): Promise<BudgetStatus[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_budget_status")
    .select("*")
    .eq("period_month", periodMonth);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => ({
      budgetId: row.budget_id,
      categoryId: row.category_id,
      // A budget with no category is the overall cap for the month.
      categoryName: row.category_name ?? "Everything",
      categoryColor: row.category_color,
      periodMonth: row.period_month,
      evaluation: evaluateBudget({
        spent: toMinor(row.spent),
        limit: toMinor(row.limit_amount),
        warnThresholdPct: row.warn_threshold_pct,
      }),
    }))
    .sort((a, b) => byUrgency(a.evaluation, b.evaluation));
}

/** Only the ones worth interrupting you about, worst first. */
export async function listBudgetWarnings(periodMonth: IsoDate): Promise<BudgetStatus[]> {
  const statuses = await listBudgetStatus(periodMonth);
  return statuses.filter((status) => status.evaluation.level !== "ok");
}

/**
 * Category budgets keyed by category id, for the inline hint shown while
 * entering an expense. The overall cap is returned separately because it
 * applies whatever category you pick.
 */
export async function getBudgetLookup(periodMonth: IsoDate) {
  const statuses = await listBudgetStatus(periodMonth);
  return {
    byCategory: Object.fromEntries(
      statuses
        .filter((status) => status.categoryId !== null)
        .map((status) => [status.categoryId as string, status]),
    ) as Record<string, BudgetStatus>,
    overall: statuses.find((status) => status.categoryId === null) ?? null,
  };
}

export type BudgetRecord = {
  id: string;
  categoryId: string | null;
  limitAmount: number;
  warnThresholdPct: number;
};

/** The raw budget rows for a month, for prefilling the editor. */
export async function listBudgets(periodMonth: IsoDate): Promise<BudgetRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("budgets")
    .select("id, category_id, limit_amount, warn_threshold_pct")
    .eq("period_month", periodMonth);

  return (data ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    limitAmount: toMinor(row.limit_amount),
    warnThresholdPct: row.warn_threshold_pct,
  }));
}
