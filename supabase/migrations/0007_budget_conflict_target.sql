-- Smart Planner :: make the budget uniqueness constraint usable as a conflict target
--
-- Saving a month's budgets is one upsert, so the app needs
-- `on conflict (user_id, period_month, category_id)`. The original index used a
-- coalesce() expression to make the overall budget (category_id is null) unique
-- per month, and Postgres will not accept an expression index as a plain-column
-- conflict target.
--
-- NULLS NOT DISTINCT gets the same guarantee with real columns: at most one
-- overall budget per user per month, and at most one per category. Requires
-- Postgres 15 or newer, which every current Supabase project runs.

drop index if exists public.budgets_user_period_category_key;

create unique index budgets_user_period_category_key
  on public.budgets (user_id, period_month, category_id)
  nulls not distinct;
