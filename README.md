# Smart Planner

A personal finance planner you can use from your phone or your laptop against
the same data.

- Record **daily expenses** as they happen, and keep **monthly commitments** in
  two separate buckets: **fixed** (same amount every period) and **recurring**
  (repeats but varies).
- Split income into **active** (salary) and **passive** (dividends, bond coupons,
  rent).
- Pre-define what you intend to spend per category each month, and get an amber
  **warning** as you approach the cap and a red one once you pass it.
- See where your largest expense is, plus savings rate, runway, and FIRE
  coverage — how much of your spending your passive income already pays for.
- Export to **Excel** (one worksheet per month) or **PDF**.

## Build status

The skeleton is complete: project scaffold, authentication, the full database
schema with row level security, the app shell, and every route in place. Feature
screens are filled in phase by phase — each placeholder says which phase it
lands in. The phase list is at the bottom of this file.

## Setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a
   new project. Pick a region close to you and save the database password.
2. In **Project Settings → API**, copy the project URL, the `anon` key and the
   `service_role` key.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. Generate a cron secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`SUPABASE_SERVICE_ROLE_KEY` bypasses row level security. It is server-only, must
never be prefixed `NEXT_PUBLIC_`, and must never be committed.

### 4. Apply the database schema

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
npm run db:types      # regenerates src/types/database.ts from the live schema
```

Or paste each file in `supabase/migrations/` into the dashboard SQL editor, in
numerical order.

### 5. Enable sign-in

In **Authentication → Providers**, email is on by default (used for magic
links). To enable Google, add your OAuth client ID and secret there.

In **Authentication → URL Configuration**, add your redirect URLs:

```
http://localhost:3000/auth/callback
https://<your-vercel-domain>/auth/callback
```

### 6. Run it

```bash
npm run dev
```

Open <http://localhost:3000>.

## Deploying to Vercel

1. Push to GitHub, then import the repository at
   [vercel.com/new](https://vercel.com/new).
2. Add the same four environment variables in **Settings → Environment
   Variables**. Leave `NEXT_PUBLIC_SITE_URL` unset — it derives from
   `VERCEL_URL`.
3. `vercel.json` already registers the two scheduled jobs. Vercel calls them
   with `Authorization: Bearer $CRON_SECRET`, which the routes verify before
   touching any data.
4. Add the deployed `/auth/callback` URL to Supabase as above.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest over the domain layer |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run db:types` | Regenerate `src/types/database.ts` |

## Architecture

```
src/
  app/
    (auth)/login           sign in — magic link or Google
    (app)/                 everything behind auth; shares the shell layout
    api/cron/              scheduled jobs, gated by CRON_SECRET
    auth/callback          code -> session exchange
  components/
    auth/  shell/  ui/     login form, sidebar and tab bar, primitives
  lib/
    domain/                budget.ts, metrics.ts, recurring.ts — the rules
    supabase/              browser, server, admin and proxy client factories
    date.ts  money.ts      calendar dates and integer minor units
    schemas.ts             zod schemas shared by forms and route handlers
  proxy.ts                 session refresh and route protection
supabase/migrations/       schema, RLS, views, seed, storage
```

Four decisions hold this together:

**Row level security is the isolation boundary.** Every table carries `user_id`
and a policy matching `auth.uid()`. The app queries as the signed-in user, so a
mistake in a query cannot leak another user's data.

**Money is integer minor units.** Floats are never used for amounts.

**Dates are calendar dates.** `2026-03-31` is a day, not an instant, so it does
not shift across timezones.

**Every rule has one implementation.** Budget classification, the derived
metrics and recurrence date math each live in exactly one module. SQL views
aggregate; they never classify.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Scaffold, auth, shell, schema, RLS | Done |
| 1 | Categories, accounts, transactions CRUD, quick add | Next |
| 2 | Recurring engine, budgets, warning indicators | |
| 3 | Dashboard, FIRE coverage, savings rate, runway | |
| 4 | Excel and PDF export | |
| 5 | PWA install and offline quick add | |
| 6 | Receipt photos, CSV import | |
| 7 | Goals, debts, net worth | |
