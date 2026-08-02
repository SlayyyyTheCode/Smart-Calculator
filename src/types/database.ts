/**
 * Database types for Smart Planner.
 *
 * Hand-written to mirror supabase/migrations/*.sql so the app is type-safe
 * before a Supabase project exists. Once your project is linked, regenerate
 * this file rather than editing it by hand:
 *
 *   npm run db:types
 */

export type TransactionDirection = "expense" | "income";
export type IncomeType = "active" | "passive";
export type ExpenseNature = "daily" | "fixed" | "recurring";
export type CategoryKind = "expense" | "income";
export type AccountType = "cash" | "bank" | "credit" | "brokerage" | "other";
export type RecurrenceFrequency = "weekly" | "monthly" | "quarterly" | "yearly";
export type TransactionStatus = "confirmed" | "draft";
export type AssetType = "cash" | "investment" | "property" | "other";
export type ImportStatus = "pending" | "committed" | "reverted";

/** Columns every table sets itself; never supplied on insert. */
type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type ProfileRow = Timestamps & {
  id: string;
  display_name: string | null;
  base_currency: string;
  locale: string;
  timezone: string;
  month_start_day: number;
  onboarded_at: string | null;
};

export type CategoryRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color: string;
  parent_id: string | null;
  sort_order: number;
  is_archived: boolean;
};

export type AccountRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance: number;
  is_liquid: boolean;
  is_archived: boolean;
};

export type RecurringRuleRow = Timestamps & {
  id: string;
  user_id: string;
  label: string;
  direction: TransactionDirection;
  income_type: IncomeType | null;
  expense_nature: ExpenseNature | null;
  category_id: string | null;
  account_id: string | null;
  amount: number | null;
  estimated_amount: number | null;
  frequency: RecurrenceFrequency;
  interval_count: number;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  last_materialized_on: string | null;
  note: string | null;
};

export type TransactionRow = Timestamps & {
  id: string;
  user_id: string;
  occurred_on: string;
  amount: number;
  direction: TransactionDirection;
  income_type: IncomeType | null;
  expense_nature: ExpenseNature | null;
  status: TransactionStatus;
  category_id: string | null;
  account_id: string | null;
  merchant: string | null;
  note: string | null;
  tags: string[];
  receipt_path: string | null;
  recurring_rule_id: string | null;
  import_batch_id: string | null;
  client_uuid: string;
};

export type BudgetRow = Timestamps & {
  id: string;
  user_id: string;
  category_id: string | null;
  period_month: string;
  limit_amount: number;
  warn_threshold_pct: number;
  rollover_enabled: boolean;
};

export type GoalRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  account_id: string | null;
  note: string | null;
  is_completed: boolean;
};

export type DebtRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  principal: number;
  remaining_balance: number;
  apr: number;
  minimum_payment: number;
  start_date: string;
  term_months: number | null;
  account_id: string | null;
  is_closed: boolean;
};

export type AssetRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  type: AssetType;
  value: number;
  currency: string;
  as_of: string;
  note: string | null;
};

export type NetWorthSnapshotRow = {
  id: string;
  user_id: string;
  as_of: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  created_at: string;
};

export type ImportBatchRow = {
  id: string;
  user_id: string;
  filename: string;
  source: string | null;
  row_count: number;
  status: ImportStatus;
  created_at: string;
};

export type MonthlySummaryRow = {
  user_id: string;
  period_month: string;
  total_expense: number;
  expense_daily: number;
  expense_fixed: number;
  expense_recurring: number;
  total_income: number;
  income_active: number;
  income_passive: number;
  transaction_count: number;
};

export type CategorySpendRow = {
  user_id: string;
  period_month: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  parent_id: string | null;
  total_amount: number;
  transaction_count: number;
};

export type AccountBalanceRow = {
  account_id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  is_liquid: boolean;
  is_archived: boolean;
  opening_balance: number;
  balance: number;
};

export type BudgetStatusRow = {
  budget_id: string;
  user_id: string;
  period_month: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  limit_amount: number;
  warn_threshold_pct: number;
  rollover_enabled: boolean;
  spent: number;
  pct_used: number;
  remaining: number;
};

/** Insert shape: server-defaulted columns become optional. */
type Insertable<T, Required extends keyof T> = Pick<T, Required> &
  Partial<Omit<T, Required | keyof Timestamps | "id">>;

type TableDef<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

type ViewDef<Row> = { Row: Row; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<ProfileRow, Insertable<ProfileRow, "id">>;
      categories: TableDef<CategoryRow, Insertable<CategoryRow, "user_id" | "name" | "kind">>;
      accounts: TableDef<AccountRow, Insertable<AccountRow, "user_id" | "name">>;
      recurring_rules: TableDef<
        RecurringRuleRow,
        Insertable<RecurringRuleRow, "user_id" | "label" | "direction" | "start_date">
      >;
      transactions: TableDef<
        TransactionRow,
        Insertable<TransactionRow, "user_id" | "occurred_on" | "amount" | "direction">
      >;
      budgets: TableDef<
        BudgetRow,
        Insertable<BudgetRow, "user_id" | "period_month" | "limit_amount">
      >;
      goals: TableDef<GoalRow, Insertable<GoalRow, "user_id" | "name" | "target_amount">>;
      debts: TableDef<
        DebtRow,
        Insertable<DebtRow, "user_id" | "name" | "principal" | "remaining_balance" | "start_date">
      >;
      assets: TableDef<AssetRow, Insertable<AssetRow, "user_id" | "name" | "value">>;
      net_worth_snapshots: TableDef<
        NetWorthSnapshotRow,
        Insertable<NetWorthSnapshotRow & { updated_at: string }, "user_id" | "as_of">
      >;
      import_batches: TableDef<
        ImportBatchRow,
        Insertable<ImportBatchRow & { updated_at: string }, "user_id" | "filename">
      >;
    };
    Views: {
      v_monthly_summary: ViewDef<MonthlySummaryRow>;
      v_category_spend: ViewDef<CategorySpendRow>;
      v_budget_status: ViewDef<BudgetStatusRow>;
      v_account_balances: ViewDef<AccountBalanceRow>;
    };
    Functions: Record<string, never>;
    Enums: {
      transaction_direction: TransactionDirection;
      income_type: IncomeType;
      expense_nature: ExpenseNature;
      category_kind: CategoryKind;
      account_type: AccountType;
      recurrence_frequency: RecurrenceFrequency;
      transaction_status: TransactionStatus;
      asset_type: AssetType;
      import_status: ImportStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
