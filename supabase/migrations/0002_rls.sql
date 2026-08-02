-- Smart Planner :: row level security
--
-- RLS is THE isolation boundary for this multi-user app. Every table below is
-- locked down with the same rule: a row is visible and writable only by the
-- user whose id is in user_id. Nothing in the application layer is trusted to
-- enforce this.
--
-- `profiles` is the one exception in shape only: its primary key IS the user id.

alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.accounts            enable row level security;
alter table public.recurring_rules     enable row level security;
alter table public.transactions        enable row level security;
alter table public.budgets             enable row level security;
alter table public.goals               enable row level security;
alter table public.debts               enable row level security;
alter table public.assets              enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.import_batches      enable row level security;

-- --------------------------------------------------------------------------
-- profiles
-- --------------------------------------------------------------------------

create policy "profiles: read own"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "profiles: insert own"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

create policy "profiles: update own"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy: a profile disappears only when the auth user is deleted
-- (via the on delete cascade), never through the API.

-- --------------------------------------------------------------------------
-- Every other table shares the identical user_id policy family.
-- --------------------------------------------------------------------------

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'categories',
    'accounts',
    'recurring_rules',
    'transactions',
    'budgets',
    'goals',
    'debts',
    'assets',
    'net_worth_snapshots',
    'import_batches'
  ]
  loop
    execute format(
      'create policy %L on public.%I for select using ((select auth.uid()) = user_id)',
      tbl || ': read own', tbl
    );
    execute format(
      'create policy %L on public.%I for insert with check ((select auth.uid()) = user_id)',
      tbl || ': insert own', tbl
    );
    execute format(
      'create policy %L on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      tbl || ': update own', tbl
    );
    execute format(
      'create policy %L on public.%I for delete using ((select auth.uid()) = user_id)',
      tbl || ': delete own', tbl
    );
  end loop;
end;
$$;
