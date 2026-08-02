import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { CategoryKind } from "@/types/database";

export type CategoryOption = {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  isArchived: boolean;
};

function toOption(row: {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  is_archived: boolean;
}): CategoryOption {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    icon: row.icon,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    isArchived: row.is_archived,
  };
}

/** Active categories, ordered the way they should appear in a picker. */
export const listCategories = cache(async (): Promise<CategoryOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, kind, color, icon, parent_id, sort_order, is_archived")
    .eq("is_archived", false)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return (data ?? []).map(toOption);
});

/** Archived ones too, for the settings screen where they can be restored. */
export const listAllCategories = cache(async (): Promise<CategoryOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, kind, color, icon, parent_id, sort_order, is_archived")
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return (data ?? []).map(toOption);
});
