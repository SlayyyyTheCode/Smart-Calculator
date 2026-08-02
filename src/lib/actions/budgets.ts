"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionState } from "@/lib/actions/result";
import { addMonths, startOfMonth } from "@/lib/date";
import { DEFAULT_WARN_THRESHOLD_PCT } from "@/lib/domain/budget";
import { parseAmount, toMajorString } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

function revalidateBudgetViews() {
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/quick-add");
}

const MONTH = /^\d{4}-\d{2}-01$/;

/**
 * Saves the whole month's budgets in one submit.
 *
 * The form posts a limit field per category plus one for the overall cap.
 * A blank or zero limit means "no budget here", which deletes any row that
 * existed — that is how you remove a budget, rather than hunting for a
 * separate delete button per row.
 */
export async function saveBudgets(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const periodMonth = formData.get("periodMonth");
  if (typeof periodMonth !== "string" || !MONTH.test(periodMonth)) {
    return fail("Pick a valid month.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const threshold = Number(formData.get("warnThresholdPct"));
  const warnThresholdPct =
    Number.isInteger(threshold) && threshold >= 1 && threshold <= 100
      ? threshold
      : DEFAULT_WARN_THRESHOLD_PCT;

  const upserts: {
    user_id: string;
    category_id: string | null;
    period_month: string;
    limit_amount: number;
    warn_threshold_pct: number;
  }[] = [];
  const clearedCategoryIds: string[] = [];
  let clearOverall = false;

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("limit:") || typeof value !== "string") continue;

    const target = key.slice("limit:".length);
    const categoryId = target === "overall" ? null : target;
    const minor = parseAmount(value);

    if (minor === null || minor <= 0) {
      if (categoryId === null) clearOverall = true;
      else clearedCategoryIds.push(categoryId);
      continue;
    }

    upserts.push({
      user_id: user.id,
      category_id: categoryId,
      period_month: periodMonth,
      limit_amount: Number(toMajorString(minor)),
      warn_threshold_pct: warnThresholdPct,
    });
  }

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("budgets")
      .upsert(upserts, { onConflict: "user_id,period_month,category_id" });
    if (error) return fail(error.message);
  }

  if (clearedCategoryIds.length > 0) {
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("period_month", periodMonth)
      .in("category_id", clearedCategoryIds);
    if (error) return fail(error.message);
  }

  if (clearOverall) {
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("period_month", periodMonth)
      .is("category_id", null);
    if (error) return fail(error.message);
  }

  revalidateBudgetViews();
  return ok(
    upserts.length === 0
      ? "Budgets cleared for this month."
      : `Saved ${upserts.length} ${upserts.length === 1 ? "budget" : "budgets"}.`,
  );
}

/**
 * Copies last month's budgets forward. Budgets rarely change month to month,
 * and retyping fifteen numbers is how a budget stops being maintained.
 */
export async function copyBudgetsFromPreviousMonth(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const periodMonth = formData.get("periodMonth");
  if (typeof periodMonth !== "string" || !MONTH.test(periodMonth)) {
    return fail("Pick a valid month.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const previousMonth = startOfMonth(addMonths(periodMonth, -1));

  const { data: previous, error } = await supabase
    .from("budgets")
    .select("category_id, limit_amount, warn_threshold_pct")
    .eq("period_month", previousMonth);

  if (error) return fail(error.message);
  if (!previous || previous.length === 0) {
    return fail("There are no budgets in the previous month to copy.");
  }

  const { error: upsertError } = await supabase.from("budgets").upsert(
    previous.map((row) => ({
      user_id: user.id,
      category_id: row.category_id,
      period_month: periodMonth,
      limit_amount: row.limit_amount,
      warn_threshold_pct: row.warn_threshold_pct,
    })),
    { onConflict: "user_id,period_month,category_id" },
  );

  if (upsertError) return fail(upsertError.message);

  revalidateBudgetViews();
  return ok(`Copied ${previous.length} from the previous month.`);
}
