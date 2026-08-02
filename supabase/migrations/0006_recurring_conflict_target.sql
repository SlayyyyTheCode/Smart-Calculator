-- Smart Planner :: make the recurring occurrence index usable as a conflict target
--
-- The materialization job needs `on conflict (recurring_rule_id, occurred_on)
-- do nothing` so a re-run, a retry, or two overlapping runs cannot post the
-- same rent payment twice. Postgres will only accept a conflict target that
-- matches a unique index exactly, and PostgREST cannot express the predicate of
-- a partial one — so the index is recreated without its WHERE clause.
--
-- This does not weaken anything. Unique indexes treat NULLs as distinct by
-- default, so the many manually-entered transactions with a null
-- recurring_rule_id still coexist happily.

drop index if exists public.transactions_rule_occurrence_key;

create unique index transactions_rule_occurrence_key
  on public.transactions (recurring_rule_id, occurred_on);
