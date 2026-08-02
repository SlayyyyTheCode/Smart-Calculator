import { NextResponse, type NextRequest } from "next/server";

import { rejectUnauthorizedCron } from "@/lib/cron";
import { DEFAULT_TIMEZONE } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import type { MaterializableRule } from "@/lib/domain/materialize";
import { runMaterialization } from "@/lib/materialize-runner";
import { toMinor } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Posts every recurring entry that has come due, for every user.
 *
 * Runs as service role, which bypasses RLS — so this handler must be the one
 * place that decides which user each row belongs to, and it does that by
 * carrying `user_id` straight through from the rule that produced it.
 *
 * Idempotent by construction: the insert ignores conflicts on
 * (recurring_rule_id, occurred_on), so re-running it posts nothing new.
 */
export async function GET(request: NextRequest) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  const { data: ruleRows, error } = await supabase
    .from("recurring_rules")
    .select(
      `id, user_id, label, direction, income_type, expense_nature, category_id, account_id,
       amount, estimated_amount, frequency, interval_count, day_of_month,
       start_date, end_date, is_active, last_materialized_on`,
    )
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rules: MaterializableRule[] = (ruleRows ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    label: row.label,
    direction: row.direction,
    incomeType: row.income_type,
    expenseNature: row.expense_nature,
    categoryId: row.category_id,
    accountId: row.account_id,
    amount: row.amount === null ? null : toMinor(row.amount),
    estimatedAmount: row.estimated_amount === null ? null : toMinor(row.estimated_amount),
    frequency: row.frequency,
    intervalCount: row.interval_count,
    dayOfMonth: row.day_of_month,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    lastMaterializedOn: row.last_materialized_on,
  }));

  // "The 1st" means the 1st where the rule's owner lives, so each user's
  // calendar date is resolved from their own profile timezone.
  const userIds = [...new Set(rules.map((rule) => rule.userId))];
  const timezones = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, timezone")
      .in("id", userIds);

    for (const profile of profiles ?? []) {
      timezones.set(profile.id, profile.timezone ?? DEFAULT_TIMEZONE);
    }
  }

  const now = new Date();
  const todayCache = new Map<string, string>();
  const todayFor = (userId: string) => {
    const cached = todayCache.get(userId);
    if (cached) return cached;
    const today = todayIso(timezones.get(userId) ?? DEFAULT_TIMEZONE, now);
    todayCache.set(userId, today);
    return today;
  };

  const result = await runMaterialization(supabase, rules, todayFor);

  return NextResponse.json(
    { ok: result.errors.length === 0, ...result },
    { status: result.errors.length === 0 ? 200 : 500 },
  );
}
