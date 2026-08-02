"use server";

import { revalidatePath } from "next/cache";

import { fail, formValues, invalid, ok, type ActionState } from "@/lib/actions/result";
import { categorySchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

function revalidateCategoryViews() {
  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
  revalidatePath("/dashboard");
}

export async function createCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = categorySchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const input = parsed.data;
  const { error } = await supabase.from("categories").insert({
    user_id: user.id,
    name: input.name,
    kind: input.kind,
    icon: input.icon ?? null,
    color: input.color,
    parent_id: input.parentId ?? null,
    sort_order: input.sortOrder,
  });

  if (error) {
    // The unique index on (user, kind, parent, lower(name)) is what stops
    // two categories with the same name from ever existing.
    return fail(
      error.code === "23505" ? "You already have a category with that name." : error.message,
    );
  }

  revalidateCategoryViews();
  return ok(`${input.name} added.`);
}

export async function renameCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return fail("Missing category id.");

  const parsed = categorySchema
    .pick({ name: true, color: true })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name: parsed.data.name, color: parsed.data.color })
    .eq("id", id);

  if (error) return fail(error.message);

  revalidateCategoryViews();
  return ok("Category updated.");
}

/**
 * Archiving rather than deleting: transactions keep pointing at the category,
 * so historical reports do not lose their labels.
 */
export async function setCategoryArchived(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const archived = formData.get("archived") === "true";
  if (typeof id !== "string" || id === "") return;

  const supabase = await createClient();
  await supabase.from("categories").update({ is_archived: archived }).eq("id", id);

  revalidateCategoryViews();
}
