import { toMinor, type Minor } from "@/lib/money";
import type { MaterializableRule } from "@/lib/domain/materialize";
import { createClient } from "@/lib/supabase/server";
import type {
  ExpenseNature,
  IncomeType,
  RecurrenceFrequency,
  TransactionDirection,
} from "@/types/database";

export type RecurringRuleItem = MaterializableRule & {
  note: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
};

const SELECT = `
  id, user_id, label, direction, income_type, expense_nature, category_id, account_id,
  amount, estimated_amount, frequency, interval_count, day_of_month,
  start_date, end_date, is_active, last_materialized_on, note,
  category:categories ( name, color ),
  account:accounts ( name )
`;

type JoinedRow = {
  id: string;
  user_id: string;
  label: string;
  direction: TransactionDirection;
  income_type: IncomeType | null;
  expense_nature: ExpenseNature | null;
  category_id: string | null;
  account_id: string | null;
  amount: number | string | null;
  estimated_amount: number | string | null;
  frequency: RecurrenceFrequency;
  interval_count: number;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  last_materialized_on: string | null;
  note: string | null;
  category: { name: string; color: string } | null;
  account: { name: string } | null;
};

function optionalMinor(value: number | string | null): Minor | null {
  return value === null ? null : toMinor(value);
}

function toItem(row: JoinedRow): RecurringRuleItem {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    direction: row.direction,
    incomeType: row.income_type,
    expenseNature: row.expense_nature,
    categoryId: row.category_id,
    accountId: row.account_id,
    amount: optionalMinor(row.amount),
    estimatedAmount: optionalMinor(row.estimated_amount),
    frequency: row.frequency,
    intervalCount: row.interval_count,
    dayOfMonth: row.day_of_month,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    lastMaterializedOn: row.last_materialized_on,
    note: row.note,
    categoryName: row.category?.name ?? null,
    categoryColor: row.category?.color ?? null,
    accountName: row.account?.name ?? null,
  };
}

export async function listRecurringRules(): Promise<RecurringRuleItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_rules")
    .select(SELECT)
    .order("is_active", { ascending: false })
    .order("label", { ascending: true });

  return (data as unknown as JoinedRow[] | null)?.map(toItem) ?? [];
}

export async function getRecurringRule(id: string): Promise<RecurringRuleItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("recurring_rules").select(SELECT).eq("id", id).maybeSingle();
  return data ? toItem(data as unknown as JoinedRow) : null;
}

/** How many auto-posted drafts are waiting for a real amount. */
export async function countPendingDrafts(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft");

  return count ?? 0;
}
