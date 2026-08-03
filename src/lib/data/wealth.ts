import { toMinor, type Minor } from "@/lib/money";
import type { NetWorthPoint } from "@/lib/domain/net-worth";
import { createClient } from "@/lib/supabase/server";
import type { AssetType } from "@/types/database";

export type GoalItem = {
  id: string;
  name: string;
  targetAmount: Minor;
  currentAmount: Minor;
  targetDate: string | null;
  accountId: string | null;
  note: string | null;
  isCompleted: boolean;
};

export type DebtItem = {
  id: string;
  name: string;
  principal: Minor;
  remainingBalance: Minor;
  apr: number;
  minimumPayment: Minor;
  startDate: string;
  termMonths: number | null;
  accountId: string | null;
  isClosed: boolean;
};

export type AssetItem = {
  id: string;
  name: string;
  type: AssetType;
  value: Minor;
  currency: string;
  asOf: string;
  note: string | null;
};

export async function listGoals(): Promise<GoalItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("goals")
    .select("id, name, target_amount, current_amount, target_date, account_id, note, is_completed")
    .order("is_completed", { ascending: true })
    .order("target_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    targetAmount: toMinor(row.target_amount),
    currentAmount: toMinor(row.current_amount),
    targetDate: row.target_date,
    accountId: row.account_id,
    note: row.note,
    isCompleted: row.is_completed,
  }));
}

export async function listDebts(): Promise<DebtItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("debts")
    .select(
      "id, name, principal, remaining_balance, apr, minimum_payment, start_date, term_months, account_id, is_closed",
    )
    .order("is_closed", { ascending: true })
    // Most expensive first: that is the one worth paying down next.
    .order("apr", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    principal: toMinor(row.principal),
    remainingBalance: toMinor(row.remaining_balance),
    apr: Number(row.apr),
    minimumPayment: toMinor(row.minimum_payment),
    startDate: row.start_date,
    termMonths: row.term_months,
    accountId: row.account_id,
    isClosed: row.is_closed,
  }));
}

export async function listAssets(): Promise<AssetItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assets")
    .select("id, name, type, value, currency, as_of, note")
    .order("value", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    value: toMinor(row.value),
    currency: row.currency,
    asOf: row.as_of,
    note: row.note,
  }));
}

/** Balances of every open account, for the assets side of net worth. */
export async function listAccountBalances(): Promise<Minor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_account_balances")
    .select("balance")
    .eq("is_archived", false);

  return (data ?? []).map((row) => toMinor(row.balance));
}

export async function listNetWorthSnapshots(limit = 24): Promise<NetWorthPoint[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("net_worth_snapshots")
    .select("as_of, total_assets, total_liabilities, net_worth")
    .order("as_of", { ascending: false })
    .limit(limit);

  // Query is newest-first so the limit keeps the most recent; the chart wants
  // them the other way round.
  return (data ?? [])
    .map((row) => ({
      asOf: row.as_of,
      totalAssets: toMinor(row.total_assets),
      totalLiabilities: toMinor(row.total_liabilities),
      netWorth: toMinor(row.net_worth),
    }))
    .reverse();
}
