"use server";

import { revalidatePath } from "next/cache";

import { fail, formValues, invalid, ok, type ActionState } from "@/lib/actions/result";
import { profileSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const input = parsed.data;

  // Upsert rather than update: the profile row normally exists from the signup
  // trigger, but this keeps the screen working if that ever did not fire.
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    display_name: input.displayName ?? null,
    base_currency: input.baseCurrency,
    locale: input.locale,
    timezone: input.timezone,
    month_start_day: input.monthStartDay,
    onboarded_at: new Date().toISOString(),
  });

  if (error) return fail(error.message);

  // Currency and locale change how every figure is rendered, everywhere.
  revalidatePath("/", "layout");
  return ok("Settings saved.");
}
