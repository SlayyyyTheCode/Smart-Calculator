-- Smart Planner :: table privileges for the authenticated role
--
-- RLS and SQL privileges are two different gates, and a request has to pass
-- both. 0002 enabled row level security and wrote the policies deciding WHICH
-- rows a user may touch. Nothing had yet granted the `authenticated` role the
-- right to touch the tables AT ALL, so every request failed first with
-- "42501 permission denied for table ..." and the policies never ran.
--
-- Granting broadly here is safe precisely because 0002 came first: every table
-- below has RLS enabled and a policy family keyed to auth.uid(), so a grant of
-- "select on transactions" is really a grant of "select on your own
-- transactions". Enabling RLS without granting gives an app that cannot read;
-- granting without enabling RLS gives an app where anyone reads everything.
-- The pair is the design.
--
-- `service_role` needs the same grants for a different reason. It bypasses RLS,
-- but bypassing RLS is not the same as holding a privilege, so the cron routes
-- failed identically until it was granted too. It is server-only, reached only
-- after rejectUnauthorizedCron() has passed.
--
-- `anon` is granted nothing. Every screen sits behind auth, and a signed-out
-- visitor has no business reaching a table.

grant usage on schema public to authenticated, service_role;

-- --------------------------------------------------------------------------
-- Base tables
-- --------------------------------------------------------------------------

-- profiles gets no delete: 0002 deliberately wrote no delete policy, because a
-- profile should disappear only with its auth user via the cascade. Withholding
-- the privilege as well means that intent survives a future policy edit.
grant select, insert, update on public.profiles to authenticated, service_role;

grant select, insert, update, delete on public.categories          to authenticated, service_role;
grant select, insert, update, delete on public.accounts            to authenticated, service_role;
grant select, insert, update, delete on public.recurring_rules     to authenticated, service_role;
grant select, insert, update, delete on public.transactions        to authenticated, service_role;
grant select, insert, update, delete on public.budgets             to authenticated, service_role;
grant select, insert, update, delete on public.goals               to authenticated, service_role;
grant select, insert, update, delete on public.debts               to authenticated, service_role;
grant select, insert, update, delete on public.assets              to authenticated, service_role;
grant select, insert, update, delete on public.net_worth_snapshots to authenticated, service_role;
grant select, insert, update, delete on public.import_batches      to authenticated, service_role;

-- --------------------------------------------------------------------------
-- Views
-- --------------------------------------------------------------------------
--
-- Read-only by nature. All four are security_invoker, so they execute with the
-- caller's own privileges and the caller's own policies apply to the tables
-- underneath — the view cannot become a way around RLS. That same property is
-- why the net worth cron sees every user through v_account_balances and must
-- group by user_id itself, which it does.

grant select on public.v_monthly_summary  to authenticated, service_role;
grant select on public.v_category_spend   to authenticated, service_role;
grant select on public.v_budget_status    to authenticated, service_role;
grant select on public.v_account_balances to authenticated, service_role;

-- No sequence grants: every primary key defaults to gen_random_uuid(), so
-- there are no sequences to own.
