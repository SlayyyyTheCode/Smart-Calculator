-- Smart Planner :: new user bootstrap
--
-- When Supabase Auth creates a user we give them a profile, a starter set of
-- categories and two accounts, so the app is never staring at an empty state
-- on first login. Everything seeded here is editable or archivable later.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_uid uuid := new.id;
begin
  insert into public.profiles (id, display_name)
  values (
    new_uid,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'there@'), '@', 1)
    )
  )
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, kind, icon, color, sort_order)
  values
    (new_uid, 'Food & Dining', 'expense', 'utensils',      '#ef4444', 10),
    (new_uid, 'Groceries',     'expense', 'shopping-cart', '#f97316', 20),
    (new_uid, 'Transport',     'expense', 'car',           '#f59e0b', 30),
    (new_uid, 'Housing',       'expense', 'home',          '#84cc16', 40),
    (new_uid, 'Utilities',     'expense', 'zap',           '#22c55e', 50),
    (new_uid, 'Healthcare',    'expense', 'heart-pulse',   '#14b8a6', 60),
    (new_uid, 'Insurance',     'expense', 'shield',        '#06b6d4', 70),
    (new_uid, 'Shopping',      'expense', 'shopping-bag',  '#3b82f6', 80),
    (new_uid, 'Entertainment', 'expense', 'clapperboard',  '#6366f1', 90),
    (new_uid, 'Subscriptions', 'expense', 'repeat',        '#8b5cf6', 100),
    (new_uid, 'Education',     'expense', 'graduation-cap','#a855f7', 110),
    (new_uid, 'Travel',        'expense', 'plane',         '#ec4899', 120),
    (new_uid, 'Other',         'expense', 'circle-ellipsis','#64748b', 900),
    (new_uid, 'Salary',        'income',  'wallet',        '#22c55e', 10),
    (new_uid, 'Bonus',         'income',  'gift',          '#16a34a', 20),
    (new_uid, 'Dividends',     'income',  'trending-up',   '#0ea5e9', 30),
    (new_uid, 'Bond Interest', 'income',  'landmark',      '#0284c7', 40),
    (new_uid, 'Rental Income', 'income',  'building',      '#6366f1', 50),
    (new_uid, 'Capital Gains', 'income',  'chart-line',    '#8b5cf6', 60),
    (new_uid, 'Other Income',  'income',  'circle-ellipsis','#64748b', 900)
  on conflict do nothing;

  insert into public.accounts (user_id, name, type, is_liquid)
  values
    (new_uid, 'Cash',      'cash', true),
    (new_uid, 'Bank',      'bank', true),
    (new_uid, 'Brokerage', 'brokerage', false)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
