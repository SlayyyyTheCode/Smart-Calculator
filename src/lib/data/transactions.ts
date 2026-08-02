import { endOfMonth } from "@/lib/date";
import { toMinor, type Minor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import {
  PAGE_SIZE,
  type TransactionFilters,
} from "@/lib/data/transaction-filters";
import type {
  ExpenseNature,
  IncomeType,
  TransactionDirection,
  TransactionStatus,
} from "@/types/database";

export type TransactionListItem = {
  id: string;
  occurredOn: string;
  amount: Minor;
  direction: TransactionDirection;
  incomeType: IncomeType | null;
  expenseNature: ExpenseNature | null;
  status: TransactionStatus;
  merchant: string | null;
  note: string | null;
  tags: string[];
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountId: string | null;
  accountName: string | null;
  recurringRuleId: string | null;
  /** Storage object key, not a URL. Signed on demand — see @/lib/data/receipts. */
  receiptPath: string | null;
};

const SELECT = `
  id, occurred_on, amount, direction, income_type, expense_nature, status,
  merchant, note, tags, category_id, account_id, recurring_rule_id, receipt_path,
  category:categories ( id, name, color ),
  account:accounts ( id, name )
`;

type JoinedRow = {
  id: string;
  occurred_on: string;
  amount: number | string;
  direction: TransactionDirection;
  income_type: IncomeType | null;
  expense_nature: ExpenseNature | null;
  status: TransactionStatus;
  merchant: string | null;
  note: string | null;
  tags: string[] | null;
  category_id: string | null;
  account_id: string | null;
  recurring_rule_id: string | null;
  receipt_path: string | null;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string } | null;
};

function toItem(row: JoinedRow): TransactionListItem {
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    // numeric arrives as a string from PostgREST; convert once, here.
    amount: toMinor(row.amount),
    direction: row.direction,
    incomeType: row.income_type,
    expenseNature: row.expense_nature,
    status: row.status,
    merchant: row.merchant,
    note: row.note,
    tags: row.tags ?? [],
    categoryId: row.category_id,
    categoryName: row.category?.name ?? null,
    categoryColor: row.category?.color ?? null,
    accountId: row.account_id,
    accountName: row.account?.name ?? null,
    recurringRuleId: row.recurring_rule_id,
    receiptPath: row.receipt_path,
  };
}

export type TransactionPage = {
  items: TransactionListItem[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * One page of transactions matching the filters.
 *
 * RLS restricts this to the current user, so no user_id predicate is needed —
 * and adding one would give a false impression that it is what protects the
 * data.
 */
export async function listTransactions(
  filters: TransactionFilters,
): Promise<TransactionPage> {
  const supabase = await createClient();

  let query = supabase
    .from("transactions")
    .select(SELECT, { count: "exact" })
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.month) {
    query = query.gte("occurred_on", filters.month).lte("occurred_on", endOfMonth(filters.month));
  }
  if (filters.direction !== "all") query = query.eq("direction", filters.direction);
  if (filters.nature !== "all") query = query.eq("expense_nature", filters.nature);
  if (filters.incomeType !== "all") query = query.eq("income_type", filters.incomeType);
  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.search) {
    const term = `%${filters.search.replace(/[%_]/g, "")}%`;
    query = query.or(`merchant.ilike.${term},note.ilike.${term}`);
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    items: (data as unknown as JoinedRow[] | null)?.map(toItem) ?? [],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getTransaction(id: string): Promise<TransactionListItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("transactions").select(SELECT).eq("id", id).maybeSingle();
  return data ? toItem(data as unknown as JoinedRow) : null;
}

/**
 * Categories the user has actually spent on recently, most used first.
 * Powers the one-tap chips on the quick add screen.
 */
export async function listFrequentCategoryIds(
  direction: TransactionDirection,
  limit = 6,
): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("category_id")
    .eq("direction", direction)
    .not("category_id", "is", null)
    .order("occurred_on", { ascending: false })
    .limit(200);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.category_id) continue;
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
