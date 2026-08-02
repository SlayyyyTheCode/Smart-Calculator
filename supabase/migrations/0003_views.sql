-- Smart Planner :: reporting views
--
-- These views aggregate only. Every ratio and every threshold classification
-- (savings rate, FIRE coverage, runway, budget OK/warn/exceeded) is derived in
-- TypeScript under src/lib/domain/ so there is exactly one implementation of
-- each rule. Duplicating that logic in SQL would guarantee eventual drift.
--
-- security_invoker = true makes each view run with the querying user's
-- privileges, so the underlying tables' RLS policies still apply.

-- ---------------------------------------------------------------------------
-- v_monthly_summary :: one row per user per month
-- ---------------------------------------------------------------------------

create view public.v_monthly_summary
with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.occurred_on)::date as period_month,
  coalesce(sum(t.amount) filter (where t.direction = 'expense'), 0) as total_expense,
  coalesce(sum(t.amount) filter (where t.direction = 'expense' and t.expense_nature = 'daily'), 0) as expense_daily,
  coalesce(sum(t.amount) filter (where t.direction = 'expense' and t.expense_nature = 'fixed'), 0) as expense_fixed,
  coalesce(sum(t.amount) filter (where t.direction = 'expense' and t.expense_nature = 'recurring'), 0) as expense_recurring,
  coalesce(sum(t.amount) filter (where t.direction = 'income'), 0) as total_income,
  coalesce(sum(t.amount) filter (where t.direction = 'income' and t.income_type = 'active'), 0) as income_active,
  coalesce(sum(t.amount) filter (where t.direction = 'income' and t.income_type = 'passive'), 0) as income_passive,
  count(*) as transaction_count
from public.transactions t
where t.status = 'confirmed'
group by t.user_id, date_trunc('month', t.occurred_on)::date;

-- ---------------------------------------------------------------------------
-- v_category_spend :: expense totals per category per month
-- drives the "where is your largest expense" breakdown
-- ---------------------------------------------------------------------------

create view public.v_category_spend
with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.occurred_on)::date as period_month,
  t.category_id,
  c.name  as category_name,
  c.color as category_color,
  c.icon  as category_icon,
  c.parent_id,
  sum(t.amount) as total_amount,
  count(*)      as transaction_count
from public.transactions t
left join public.categories c on c.id = t.category_id
where t.direction = 'expense'
  and t.status = 'confirmed'
group by
  t.user_id,
  date_trunc('month', t.occurred_on)::date,
  t.category_id,
  c.name, c.color, c.icon, c.parent_id;

-- ---------------------------------------------------------------------------
-- v_budget_status :: each budget joined to what was actually spent against it
--
-- A budget with category_id = null is the overall monthly cap and is measured
-- against every expense in the month. A category budget also absorbs the spend
-- of its direct child categories, so a "Food" budget covers "Groceries" beneath
-- it. pct_used is plain arithmetic; the OK / warn / exceeded call is made by
-- src/lib/domain/budget.ts.
-- ---------------------------------------------------------------------------

create view public.v_budget_status
with (security_invoker = true) as
select
  b.id            as budget_id,
  b.user_id,
  b.period_month,
  b.category_id,
  c.name          as category_name,
  c.color         as category_color,
  b.limit_amount,
  b.warn_threshold_pct,
  b.rollover_enabled,
  coalesce(s.spent, 0) as spent,
  case
    when b.limit_amount > 0 then round(coalesce(s.spent, 0) * 100.0 / b.limit_amount, 2)
    else 0
  end as pct_used,
  b.limit_amount - coalesce(s.spent, 0) as remaining
from public.budgets b
left join public.categories c on c.id = b.category_id
left join lateral (
  select sum(t.amount) as spent
  from public.transactions t
  where t.user_id = b.user_id
    and t.direction = 'expense'
    and t.status = 'confirmed'
    and date_trunc('month', t.occurred_on)::date = b.period_month
    and (
      b.category_id is null
      or t.category_id = b.category_id
      or t.category_id in (
        select ch.id from public.categories ch where ch.parent_id = b.category_id
      )
    )
) s on true;
