-- Smart Planner :: account balances
--
-- Runway asks "how many months does my cash cover", which needs a current
-- balance per account rather than the opening figure it was set up with.
--
-- The balance is the opening balance plus every confirmed transaction booked
-- against the account. Drafts are excluded, matching every other total in the
-- app: a forecast is not money that has moved.

create view public.v_account_balances
with (security_invoker = true) as
select
  a.id   as account_id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.is_liquid,
  a.is_archived,
  a.opening_balance,
  a.opening_balance
    + coalesce(sum(t.amount) filter (where t.direction = 'income'), 0)
    - coalesce(sum(t.amount) filter (where t.direction = 'expense'), 0) as balance
from public.accounts a
left join public.transactions t
  on t.account_id = a.id
 and t.status = 'confirmed'
group by
  a.id, a.user_id, a.name, a.type, a.currency,
  a.is_liquid, a.is_archived, a.opening_balance;
