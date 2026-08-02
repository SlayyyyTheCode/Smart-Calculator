"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fail, formValues, invalid, ok, type ActionState } from "@/lib/actions/result";
import { getFormatting } from "@/lib/data/profile";
import { listRecurringRules } from "@/lib/data/recurring";
import { todayIso } from "@/lib/date";
import { runMaterialization } from "@/lib/materialize-runner";
import { toMajorString } from "@/lib/money";
import { recurringRuleSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

function revalidateRecurringViews() {
  revalidatePath("/recurring");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}

/**
 * The direction radio decides which fields are meaningful. Clearing the rest
 * here keeps the schema errors about what the user actually got wrong.
 */
function readRuleForm(formData: FormData) {
  const values = formValues(formData);
  const isExpense = values.direction === "expense";
  const nature = isExpense ? values.expenseNature : null;

  return {
    ...values,
    incomeType: isExpense ? null : values.incomeType,
    expenseNature: nature,
    // A fixed rule carries an amount; a variable one carries an estimate.
    // Sending both invites a rule that says two different things.
    amount: nature === "recurring" ? null : values.amount,
    estimatedAmount: nature === "recurring" ? values.estimatedAmount : null,
    isActive: formData.get("isActive") !== "false",
  };
}

function toRow(input: ReturnType<typeof recurringRuleSchema.parse>) {
  return {
    label: input.label,
    direction: input.direction,
    income_type: input.incomeType ?? null,
    expense_nature: input.expenseNature ?? null,
    category_id: input.categoryId ?? null,
    account_id: input.accountId ?? null,
    amount: input.amount ? Number(toMajorString(input.amount)) : null,
    estimated_amount: input.estimatedAmount ? Number(toMajorString(input.estimatedAmount)) : null,
    frequency: input.frequency,
    interval_count: input.intervalCount,
    day_of_month: input.dayOfMonth ?? null,
    start_date: input.startDate,
    end_date: input.endDate ?? null,
    is_active: input.isActive,
    note: input.note ?? null,
  };
}

export async function createRecurringRule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = recurringRuleSchema.safeParse(readRuleForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const { error } = await supabase
    .from("recurring_rules")
    .insert({ user_id: user.id, ...toRow(parsed.data) });

  if (error) return fail(error.message);

  revalidateRecurringViews();
  return ok(`${parsed.data.label} added.`);
}

export async function updateRecurringRule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return fail("Missing rule id.");

  const parsed = recurringRuleSchema.safeParse(readRuleForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("recurring_rules").update(toRow(parsed.data)).eq("id", id);

  if (error) return fail(error.message);

  revalidateRecurringViews();
  redirect("/recurring");
}

export async function setRuleActive(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const active = formData.get("active") === "true";
  if (typeof id !== "string" || id === "") return;

  const supabase = await createClient();
  await supabase.from("recurring_rules").update({ is_active: active }).eq("id", id);

  revalidateRecurringViews();
}

/**
 * Deleting a rule leaves the transactions it already posted alone — they
 * happened, and removing them would rewrite your history. The foreign key is
 * `on delete set null`, so those entries simply stop pointing at a rule.
 */
export async function deleteRecurringRule(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return;

  const supabase = await createClient();
  await supabase.from("recurring_rules").delete().eq("id", id);

  revalidateRecurringViews();

  const redirectTo = formData.get("redirectTo");
  if (typeof redirectTo === "string" && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    redirect(redirectTo);
  }
}

/**
 * Post everything your rules currently owe, without waiting for the nightly
 * job. Runs as you, so RLS confines it to your own rules.
 */
export async function materializeNow(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const [rules, formatting] = await Promise.all([listRecurringRules(), getFormatting()]);
  const today = todayIso(formatting.timezone);

  const result = await runMaterialization(supabase, rules, () => today);

  if (result.errors.length > 0) return fail(result.errors[0]);

  revalidateRecurringViews();

  if (result.transactionsPosted === 0) {
    return ok("Nothing due — everything is already posted.");
  }
  return ok(
    `Posted ${result.transactionsPosted} ${result.transactionsPosted === 1 ? "entry" : "entries"}.`,
  );
}
