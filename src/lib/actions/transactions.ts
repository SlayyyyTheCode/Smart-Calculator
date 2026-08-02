"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fail, formValues, invalid, ok, type ActionState } from "@/lib/actions/result";
import { toMajorString } from "@/lib/money";
import { transactionSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

/** Screens whose data changes whenever a transaction does. */
function revalidateTransactionViews() {
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/quick-add");
}

/**
 * Normalises the form payload before validation.
 *
 * The direction radio decides which of income_type / expense_nature is
 * meaningful, so the other is cleared here rather than being sent as an empty
 * string that would fail the schema for a confusing reason.
 */
function readTransactionForm(formData: FormData) {
  const values = formValues(formData);
  const direction = values.direction;

  const tagsRaw = typeof values.tags === "string" ? values.tags : "";
  const tags = tagsRaw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    ...values,
    tags,
    incomeType: direction === "income" ? values.incomeType : null,
    expenseNature: direction === "expense" ? values.expenseNature : null,
  };
}

export async function createTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = transactionSchema.safeParse(readTransactionForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const input = parsed.data;
  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    occurred_on: input.occurredOn,
    amount: Number(toMajorString(input.amount)),
    direction: input.direction,
    income_type: input.incomeType ?? null,
    expense_nature: input.expenseNature ?? null,
    category_id: input.categoryId ?? null,
    account_id: input.accountId ?? null,
    merchant: input.merchant ?? null,
    note: input.note ?? null,
    tags: input.tags,
    ...(input.clientUuid ? { client_uuid: input.clientUuid } : {}),
  });

  if (error) return fail(error.message);

  revalidateTransactionViews();
  return ok(input.direction === "expense" ? "Expense recorded." : "Income recorded.");
}

export async function updateTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return fail("Missing transaction id.");

  const parsed = transactionSchema.safeParse(readTransactionForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const input = parsed.data;

  const { error } = await supabase
    .from("transactions")
    .update({
      occurred_on: input.occurredOn,
      amount: Number(toMajorString(input.amount)),
      direction: input.direction,
      income_type: input.incomeType ?? null,
      expense_nature: input.expenseNature ?? null,
      category_id: input.categoryId ?? null,
      account_id: input.accountId ?? null,
      merchant: input.merchant ?? null,
      note: input.note ?? null,
      tags: input.tags,
      // Editing a draft posted by a recurring rule is how you confirm it.
      status: "confirmed",
    })
    .eq("id", id);

  if (error) return fail(error.message);

  revalidateTransactionViews();
  redirect("/transactions");
}

export async function deleteTransaction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return;

  const supabase = await createClient();
  await supabase.from("transactions").delete().eq("id", id);

  revalidateTransactionViews();

  // Deleting from the list leaves you on the list. Deleting from the entry's
  // own page would leave you on a 404, so that form passes somewhere to go.
  const redirectTo = formData.get("redirectTo");
  if (typeof redirectTo === "string" && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    redirect(redirectTo);
  }
}
