"use server";

import { revalidatePath } from "next/cache";

import { checkbox, fail, formValues, invalid, ok, type ActionState } from "@/lib/actions/result";
import { toMajorString } from "@/lib/money";
import { accountSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

function revalidateAccountViews() {
  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
  revalidatePath("/dashboard");
}

export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = accountSchema.safeParse({
    ...formValues(formData),
    isLiquid: checkbox(formData, "isLiquid"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const input = parsed.data;
  const { error } = await supabase.from("accounts").insert({
    user_id: user.id,
    name: input.name,
    type: input.type,
    currency: input.currency,
    opening_balance: Number(toMajorString(input.openingBalance)),
    is_liquid: input.isLiquid,
  });

  if (error) {
    return fail(
      error.code === "23505" ? "You already have an account with that name." : error.message,
    );
  }

  revalidateAccountViews();
  return ok(`${input.name} added.`);
}

export async function updateAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return fail("Missing account id.");

  const parsed = accountSchema.safeParse({
    ...formValues(formData),
    isLiquid: checkbox(formData, "isLiquid"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const input = parsed.data;

  const { error } = await supabase
    .from("accounts")
    .update({
      name: input.name,
      type: input.type,
      currency: input.currency,
      opening_balance: Number(toMajorString(input.openingBalance)),
      is_liquid: input.isLiquid,
    })
    .eq("id", id);

  if (error) return fail(error.message);

  revalidateAccountViews();
  return ok("Account updated.");
}

/** Archive rather than delete, so past transactions keep their account name. */
export async function setAccountArchived(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const archived = formData.get("archived") === "true";
  if (typeof id !== "string" || id === "") return;

  const supabase = await createClient();
  await supabase.from("accounts").update({ is_archived: archived }).eq("id", id);

  revalidateAccountViews();
}
