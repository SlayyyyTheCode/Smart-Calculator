import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { planBatch, type MaterializableRule } from "@/lib/domain/materialize";
import { toMajorString } from "@/lib/money";
import type { Database } from "@/types/database";
import type { IsoDate } from "@/lib/date";

export type MaterializationResult = {
  rulesConsidered: number;
  transactionsPosted: number;
  rulesAdvanced: number;
  errors: string[];
};

/**
 * Writes the plan produced by planBatch.
 *
 * Shared by the nightly cron (running as service role across every user) and
 * the "run now" button on the recurring screen (running as the signed-in user,
 * under RLS). Both paths must behave identically, so neither gets its own copy.
 *
 * Inserts use `ignoreDuplicates` against the unique
 * (recurring_rule_id, occurred_on) index, which makes the whole operation safe
 * to repeat: a retry, an overlapping run, or a manual click right after the
 * cron all converge on the same rows.
 */
export async function runMaterialization(
  supabase: SupabaseClient<Database>,
  rules: MaterializableRule[],
  todayFor: (userId: string) => IsoDate,
): Promise<MaterializationResult> {
  const result: MaterializationResult = {
    rulesConsidered: rules.length,
    transactionsPosted: 0,
    rulesAdvanced: 0,
    errors: [],
  };

  const plan = planBatch(rules, todayFor);
  if (plan.transactions.length === 0) return result;

  const rows = plan.transactions.map((transaction) => ({
    user_id: transaction.userId,
    occurred_on: transaction.occurredOn,
    amount: Number(toMajorString(transaction.amount)),
    direction: transaction.direction,
    income_type: transaction.incomeType,
    expense_nature: transaction.expenseNature,
    status: transaction.status,
    category_id: transaction.categoryId,
    account_id: transaction.accountId,
    note: transaction.note,
    recurring_rule_id: transaction.ruleId,
  }));

  const { data: inserted, error } = await supabase
    .from("transactions")
    .upsert(rows, { onConflict: "recurring_rule_id,occurred_on", ignoreDuplicates: true })
    .select("id");

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  result.transactionsPosted = inserted?.length ?? 0;

  // The cursor moves even when every row was a duplicate: those occurrences
  // exist, which is exactly what the cursor records.
  for (const [ruleId, cursor] of plan.cursors) {
    const { error: cursorError } = await supabase
      .from("recurring_rules")
      .update({ last_materialized_on: cursor })
      .eq("id", ruleId);

    if (cursorError) result.errors.push(`${ruleId}: ${cursorError.message}`);
    else result.rulesAdvanced += 1;
  }

  return result;
}
