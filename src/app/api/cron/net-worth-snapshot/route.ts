import { NextResponse, type NextRequest } from "next/server";

import { rejectUnauthorizedCron } from "@/lib/cron";
import { DEFAULT_TIMEZONE } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import { computeNetWorth } from "@/lib/domain/net-worth";
import { toMajorString, toMinor, type Minor } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records one net worth snapshot per user.
 *
 * Runs as service role, which bypasses RLS — so every query below groups by
 * user_id explicitly and nothing is written that is not keyed to the user it
 * came from. The upsert is on (user_id, as_of), so running twice in a day
 * overwrites rather than duplicating.
 */
export async function GET(request: NextRequest) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  const [{ data: profiles, error: profileError }, balances, assets, debts] = await Promise.all([
    supabase.from("profiles").select("id, timezone"),
    supabase.from("v_account_balances").select("user_id, balance").eq("is_archived", false),
    supabase.from("assets").select("user_id, value"),
    supabase.from("debts").select("user_id, remaining_balance").eq("is_closed", false),
  ]);

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  const byUser = new Map<
    string,
    { accountBalances: Minor[]; assetValues: Minor[]; debtBalances: Minor[] }
  >();

  const bucket = (userId: string) => {
    let entry = byUser.get(userId);
    if (!entry) {
      entry = { accountBalances: [], assetValues: [], debtBalances: [] };
      byUser.set(userId, entry);
    }
    return entry;
  };

  for (const row of balances.data ?? []) bucket(row.user_id).accountBalances.push(toMinor(row.balance));
  for (const row of assets.data ?? []) bucket(row.user_id).assetValues.push(toMinor(row.value));
  for (const row of debts.data ?? []) {
    bucket(row.user_id).debtBalances.push(toMinor(row.remaining_balance));
  }

  const now = new Date();
  const rows = (profiles ?? [])
    .filter((profile) => byUser.has(profile.id))
    .map((profile) => {
      const breakdown = computeNetWorth(byUser.get(profile.id)!);
      return {
        user_id: profile.id,
        // "Today" is the user's own calendar date, so a snapshot lands on the
        // day they would call it.
        as_of: todayIso(profile.timezone ?? DEFAULT_TIMEZONE, now),
        total_assets: Number(toMajorString(breakdown.totalAssets)),
        total_liabilities: Number(toMajorString(breakdown.totalLiabilities)),
        net_worth: Number(toMajorString(breakdown.netWorth)),
      };
    });

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, snapshots: 0, note: "Nobody had anything to record." });
  }

  const { error } = await supabase
    .from("net_worth_snapshots")
    .upsert(rows, { onConflict: "user_id,as_of" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snapshots: rows.length });
}
