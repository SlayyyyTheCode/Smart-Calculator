"use server";

import { revalidatePath } from "next/cache";

import { fail, formValues, invalid, ok, type ActionState } from "@/lib/actions/result";
import { getFormatting } from "@/lib/data/profile";
import { listAccountBalances, listAssets, listDebts } from "@/lib/data/wealth";
import { todayIso } from "@/lib/date";
import { computeNetWorth } from "@/lib/domain/net-worth";
import { parseAmount, toMajorString, toMinor } from "@/lib/money";
import { assetSchema, debtSchema, goalSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

function revalidateWealthViews() {
  revalidatePath("/goals");
  revalidatePath("/debts");
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export async function saveGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = goalSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const userId = await currentUserId();
  if (!userId) return fail("Your session has expired. Sign in again.");

  const supabase = await createClient();
  const input = parsed.data;
  const row = {
    name: input.name,
    target_amount: Number(toMajorString(input.targetAmount)),
    current_amount: Number(toMajorString(input.currentAmount)),
    target_date: input.targetDate ?? null,
    account_id: input.accountId ?? null,
    note: input.note ?? null,
    // Reaching the target is what completes a goal; there is no separate step.
    is_completed: input.currentAmount >= input.targetAmount,
  };

  const id = formData.get("id");
  const { error } =
    typeof id === "string" && id !== ""
      ? await supabase.from("goals").update(row).eq("id", id)
      : await supabase.from("goals").insert({ user_id: userId, ...row });

  if (error) return fail(error.message);

  revalidateWealthViews();
  return ok(typeof id === "string" && id !== "" ? "Goal updated." : `${input.name} added.`);
}

/** Records a contribution. Kept separate so the common action is one click. */
export async function contributeToGoal(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const amountRaw = formData.get("amount");
  if (typeof id !== "string" || id === "" || typeof amountRaw !== "string") return;

  const amount = parseAmount(amountRaw);
  if (amount === null || amount === 0) return;

  const supabase = await createClient();
  const { data: goal } = await supabase
    .from("goals")
    .select("current_amount, target_amount")
    .eq("id", id)
    .maybeSingle();

  if (!goal) return;

  // Never below zero: a correction that overshoots should empty the goal, not
  // make it owe money.
  const next = Math.max(toMinor(goal.current_amount) + amount, 0);

  await supabase
    .from("goals")
    .update({
      current_amount: Number(toMajorString(next)),
      is_completed: next >= toMinor(goal.target_amount),
    })
    .eq("id", id);

  revalidateWealthViews();
}

export async function deleteGoal(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return;

  const supabase = await createClient();
  await supabase.from("goals").delete().eq("id", id);
  revalidateWealthViews();
}

// ---------------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------------

export async function saveDebt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = debtSchema.safeParse({
    ...values,
    // A new debt starts owing what was borrowed.
    remainingBalance: values.remainingBalance ?? values.principal,
  });
  if (!parsed.success) return invalid(parsed.error);

  const userId = await currentUserId();
  if (!userId) return fail("Your session has expired. Sign in again.");

  const supabase = await createClient();
  const input = parsed.data;
  const row = {
    name: input.name,
    principal: Number(toMajorString(input.principal)),
    remaining_balance: Number(toMajorString(input.remainingBalance)),
    apr: input.apr,
    minimum_payment: Number(toMajorString(input.minimumPayment)),
    start_date: input.startDate,
    term_months: input.termMonths ?? null,
    account_id: input.accountId ?? null,
    is_closed: input.remainingBalance === 0,
  };

  const id = formData.get("id");
  const { error } =
    typeof id === "string" && id !== ""
      ? await supabase.from("debts").update(row).eq("id", id)
      : await supabase.from("debts").insert({ user_id: userId, ...row });

  if (error) return fail(error.message);

  revalidateWealthViews();
  return ok(typeof id === "string" && id !== "" ? "Debt updated." : `${input.name} added.`);
}

export async function deleteDebt(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return;

  const supabase = await createClient();
  await supabase.from("debts").delete().eq("id", id);
  revalidateWealthViews();
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export async function saveAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = assetSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const userId = await currentUserId();
  if (!userId) return fail("Your session has expired. Sign in again.");

  const supabase = await createClient();
  const input = parsed.data;
  const row = {
    name: input.name,
    type: input.type,
    value: Number(toMajorString(input.value)),
    currency: input.currency,
    as_of: input.asOf,
    note: input.note ?? null,
  };

  const id = formData.get("id");
  const { error } =
    typeof id === "string" && id !== ""
      ? await supabase.from("assets").update(row).eq("id", id)
      : await supabase.from("assets").insert({ user_id: userId, ...row });

  if (error) return fail(error.message);

  revalidateWealthViews();
  return ok(typeof id === "string" && id !== "" ? "Asset updated." : `${input.name} added.`);
}

export async function deleteAsset(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return;

  const supabase = await createClient();
  await supabase.from("assets").delete().eq("id", id);
  revalidateWealthViews();
}

/**
 * Records a net worth snapshot for today, without waiting for the monthly job.
 *
 * Uses the same composition the cron does, so a snapshot taken by hand and one
 * taken automatically are the same figure.
 */
export async function snapshotNetWorthNow(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const userId = await currentUserId();
  if (!userId) return fail("Your session has expired. Sign in again.");

  const [balances, assets, debts, formatting] = await Promise.all([
    listAccountBalances(),
    listAssets(),
    listDebts(),
    getFormatting(),
  ]);

  const breakdown = computeNetWorth({
    accountBalances: balances,
    assetValues: assets.map((asset) => asset.value),
    debtBalances: debts.filter((debt) => !debt.isClosed).map((debt) => debt.remainingBalance),
  });

  const supabase = await createClient();
  const { error } = await supabase.from("net_worth_snapshots").upsert(
    {
      user_id: userId,
      as_of: todayIso(formatting.timezone),
      total_assets: Number(toMajorString(breakdown.totalAssets)),
      total_liabilities: Number(toMajorString(breakdown.totalLiabilities)),
      net_worth: Number(toMajorString(breakdown.netWorth)),
    },
    { onConflict: "user_id,as_of" },
  );

  if (error) return fail(error.message);

  revalidateWealthViews();
  return ok("Snapshot recorded.");
}
