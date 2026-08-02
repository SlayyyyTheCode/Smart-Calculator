import { cache } from "react";

import { toMinor, type Minor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { AccountType } from "@/types/database";

export type AccountOption = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: Minor;
  isLiquid: boolean;
  isArchived: boolean;
};

const SELECT = "id, name, type, currency, opening_balance, is_liquid, is_archived";

function toOption(row: {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance: number | string;
  is_liquid: boolean;
  is_archived: boolean;
}): AccountOption {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    // PostgREST can hand numeric back as a string; toMinor accepts either.
    openingBalance: toMinor(row.opening_balance),
    isLiquid: row.is_liquid,
    isArchived: row.is_archived,
  };
}

export const listAccounts = cache(async (): Promise<AccountOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select(SELECT)
    .eq("is_archived", false)
    .order("name", { ascending: true });

  return (data ?? []).map(toOption);
});

export const listAllAccounts = cache(async (): Promise<AccountOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("accounts").select(SELECT).order("name", { ascending: true });
  return (data ?? []).map(toOption);
});
