-- Smart Planner :: core schema
-- All user data tables carry user_id -> auth.users(id) and are protected by RLS (0002_rls.sql).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------

create type transaction_direction as enum ('expense', 'income');

-- active  = salary / wages / bonus (you traded time for it)
-- passive = dividends, bond coupons, rent, royalties
create type income_type as enum ('active', 'passive');

-- daily     = ad-hoc day-to-day spend
-- fixed     = same amount every period (rent, insurance)
-- recurring = repeats every period but the amount varies (utilities, groceries)
create type expense_nature as enum ('daily', 'fixed', 'recurring');

create type category_kind as enum ('expense', 'income');

create type account_type as enum ('cash', 'bank', 'credit', 'brokerage', 'other');

create type recurrence_frequency as enum ('weekly', 'monthly', 'quarterly', 'yearly');

-- draft rows are auto-generated from a variable recurring rule and await
-- confirmation with the real amount; they are excluded from every total.
create type transaction_status as enum ('confirmed', 'draft');

create type asset_type as enum ('cash', 'investment', 'property', 'other');

create type import_status as enum ('pending', 'committed', 'reverted');

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text,
  base_currency   char(3) not null default 'SGD',
  locale          text    not null default 'en-SG',
  timezone        text    not null default 'Asia/Singapore',
  -- supports salary-cycle months, e.g. 25 => a "month" runs 25th to 24th
  month_start_day smallint not null default 1 check (month_start_day between 1 and 28),
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  kind        category_kind not null,
  icon        text,
  color       text not null default '#64748b',
  parent_id   uuid references public.categories (id) on delete set null,
  sort_order  integer not null default 0,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index categories_user_name_parent_key
  on public.categories (user_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index categories_user_kind_idx on public.categories (user_id, kind) where not is_archived;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- accounts  (needed for runway and net worth)
-- ---------------------------------------------------------------------------

create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  type            account_type not null default 'bank',
  currency        char(3) not null default 'SGD',
  opening_balance numeric(14, 2) not null default 0,
  -- liquid accounts count toward the runway calculation
  is_liquid       boolean not null default true,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index accounts_user_name_key on public.accounts (user_id, lower(name));

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- recurring_rules
-- ---------------------------------------------------------------------------

create table public.recurring_rules (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  label                 text not null,
  direction             transaction_direction not null,
  income_type           income_type,
  expense_nature        expense_nature,
  category_id           uuid references public.categories (id) on delete set null,
  account_id            uuid references public.accounts (id) on delete set null,
  -- amount is authoritative for `fixed`; estimated_amount is a forecast for `recurring`
  amount                numeric(14, 2) check (amount is null or amount > 0),
  estimated_amount      numeric(14, 2) check (estimated_amount is null or estimated_amount > 0),
  frequency             recurrence_frequency not null default 'monthly',
  interval_count        smallint not null default 1 check (interval_count between 1 and 12),
  day_of_month          smallint check (day_of_month between 1 and 31),
  start_date            date not null,
  end_date              date,
  is_active             boolean not null default true,
  last_materialized_on  date,
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint recurring_rules_direction_fields check (
    (direction = 'expense' and income_type is null and expense_nature in ('fixed', 'recurring'))
    or
    (direction = 'income' and income_type is not null and expense_nature is null)
  ),
  -- a fixed rule must know its amount; a variable one must at least estimate
  constraint recurring_rules_amount_present check (
    (expense_nature = 'recurring' and estimated_amount is not null)
    or
    (expense_nature is distinct from 'recurring' and amount is not null)
  ),
  constraint recurring_rules_date_order check (end_date is null or end_date >= start_date)
);

create index recurring_rules_due_idx
  on public.recurring_rules (user_id, is_active, last_materialized_on);

create trigger recurring_rules_set_updated_at
  before update on public.recurring_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions  (one table for both money in and money out)
-- ---------------------------------------------------------------------------

create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  occurred_on       date not null,
  amount            numeric(14, 2) not null check (amount > 0),
  direction         transaction_direction not null,
  income_type       income_type,
  expense_nature    expense_nature,
  status            transaction_status not null default 'confirmed',
  category_id       uuid references public.categories (id) on delete set null,
  account_id        uuid references public.accounts (id) on delete set null,
  merchant          text,
  note              text,
  tags              text[] not null default '{}',
  receipt_path      text,
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  import_batch_id   uuid,
  -- generated on the client so an offline entry replayed twice cannot duplicate
  client_uuid       uuid not null default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint transactions_direction_fields check (
    (direction = 'expense' and income_type is null and expense_nature is not null)
    or
    (direction = 'income' and income_type is not null and expense_nature is null)
  )
);

-- offline replay safety
create unique index transactions_user_client_uuid_key
  on public.transactions (user_id, client_uuid);

-- recurring materialization idempotency: one posting per rule per date
create unique index transactions_rule_occurrence_key
  on public.transactions (recurring_rule_id, occurred_on)
  where recurring_rule_id is not null;

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_user_category_idx on public.transactions (user_id, category_id, occurred_on desc);
create index transactions_user_status_idx on public.transactions (user_id, status) where status = 'draft';

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------

create table public.budgets (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  -- null category_id means "overall cap for the month"
  category_id        uuid references public.categories (id) on delete cascade,
  period_month       date not null,
  limit_amount       numeric(14, 2) not null check (limit_amount > 0),
  warn_threshold_pct smallint not null default 80 check (warn_threshold_pct between 1 and 100),
  rollover_enabled   boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint budgets_period_is_month_start check (date_trunc('month', period_month)::date = period_month)
);

create unique index budgets_user_period_category_key
  on public.budgets (user_id, period_month, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- goals / debts / assets / net worth
-- ---------------------------------------------------------------------------

create table public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  target_amount  numeric(14, 2) not null check (target_amount > 0),
  current_amount numeric(14, 2) not null default 0 check (current_amount >= 0),
  target_date    date,
  account_id     uuid references public.accounts (id) on delete set null,
  note           text,
  is_completed   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create table public.debts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  principal         numeric(14, 2) not null check (principal > 0),
  remaining_balance numeric(14, 2) not null check (remaining_balance >= 0),
  apr               numeric(6, 3) not null default 0 check (apr >= 0),
  minimum_payment   numeric(14, 2) not null default 0 check (minimum_payment >= 0),
  start_date        date not null,
  term_months       smallint check (term_months > 0),
  account_id        uuid references public.accounts (id) on delete set null,
  is_closed         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger debts_set_updated_at
  before update on public.debts
  for each row execute function public.set_updated_at();

create table public.assets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  type       asset_type not null default 'investment',
  value      numeric(14, 2) not null check (value >= 0),
  currency   char(3) not null default 'SGD',
  as_of      date not null default current_date,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

create table public.net_worth_snapshots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  as_of             date not null,
  total_assets      numeric(14, 2) not null default 0,
  total_liabilities numeric(14, 2) not null default 0,
  net_worth         numeric(14, 2) not null default 0,
  created_at        timestamptz not null default now()
);

create unique index net_worth_snapshots_user_date_key
  on public.net_worth_snapshots (user_id, as_of);

-- ---------------------------------------------------------------------------
-- import_batches  (lets a bad CSV import be reverted wholesale)
-- ---------------------------------------------------------------------------

create table public.import_batches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  filename   text not null,
  source     text,
  row_count  integer not null default 0,
  status     import_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.transactions
  add constraint transactions_import_batch_fkey
  foreign key (import_batch_id) references public.import_batches (id) on delete set null;
