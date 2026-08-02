<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Smart Planner

Personal finance planner: daily and monthly expenses, active and passive income,
budgets with warning indicators, PDF and Excel export.

## Stack

Next.js 16 (App Router, RSC) · TypeScript · Tailwind v4 · Supabase (Postgres,
Auth, Storage) · Vercel. Routing uses `src/proxy.ts`, not `middleware.ts` — that
convention is deprecated in Next 16.

## Rules that are not negotiable

**RLS is the security boundary.** Every table has `user_id` and a policy family
matching `auth.uid()`. Query through `@/lib/supabase/server` (acts as the user).
`@/lib/supabase/admin` bypasses RLS and is for cron routes only, after
`rejectUnauthorizedCron()` has passed.

**Money is integer minor units.** Parse at the boundary with
`@/lib/money`'s `parseAmount`/`toMinor`, store via `toMajorString`. Never do
arithmetic on a float amount.

**Dates are calendar dates, not instants.** Use `@/lib/date`, which works on
`YYYY-MM-DD` strings. A JS `Date` in local time will shift the day.

**One implementation per rule.** Budget classification lives only in
`@/lib/domain/budget`; derived metrics only in `@/lib/domain/metrics`;
recurrence date math only in `@/lib/domain/recurring`. SQL views aggregate;
they never classify. If you need a rule in SQL and TypeScript, that is a signal
the rule is in the wrong place.

## The three expense natures

- `daily` — ad-hoc spending.
- `fixed` — same amount every period; the cron job posts it as confirmed.
- `recurring` — repeats but varies; the cron job posts a **draft** from the
  estimate, excluded from every total until you confirm the real figure.

Income splits `active` (salary) from `passive` (dividends, coupons, rent).

## Commands

```
npm run dev        npm run build      npm run lint
npm run typecheck  npm run test       npm run db:push
```

Schema changes go in a new numbered file under `supabase/migrations/`, then
`npm run db:push` and `npm run db:types`.
