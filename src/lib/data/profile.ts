import { cache } from "react";

import { DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

export type Formatting = {
  currency: string;
  locale: string;
  timezone: string;
  monthStartDay: number;
};

/**
 * The signed-in user's profile.
 *
 * Wrapped in React's `cache` so several server components in one render can ask
 * for it without repeating the query.
 */
export const getProfile = cache(async (): Promise<ProfileRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").maybeSingle();
  return data ?? null;
});

/**
 * How to format money and dates for this user. Falls back to the defaults if
 * the profile row has not been created yet, so a render never crashes on a
 * half-set-up account.
 */
export const getFormatting = cache(async (): Promise<Formatting> => {
  const profile = await getProfile();
  return {
    currency: profile?.base_currency ?? DEFAULT_CURRENCY,
    locale: profile?.locale ?? DEFAULT_LOCALE,
    timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
    monthStartDay: profile?.month_start_day ?? 1,
  };
});
