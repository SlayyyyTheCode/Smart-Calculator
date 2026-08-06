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

All seven phases are complete. Every screen listed above is built: sign-in,
quick add, the transaction list, recurring rules that post themselves, budgets
with warning indicators, the dashboard and its derived metrics, Excel and PDF
export, installable-app support with offline quick add, receipt photos, CSV
import, goals, debts and net worth.

**Verified against a local Postgres, not yet against a hosted project.** The
whole stack has been exercised on the Supabase CLI's local containers: all nine
migrations apply to an empty database, signup seeds a new user, a second user
reads none of the first user's rows through any table or view, both cron routes
run, all twelve screens render, and an expense entered in quick add reaches the
dashboard. That run found four real defects, all now fixed.

Every subsystem has since been driven end to end on that stack: the Excel
workbook opens with a `Summary` sheet, one sheet per month and correct totals;
the PDF is a valid multi-page document; a receipt photo uploads and lands in the
Storage bucket under the uploader's own folder; and a bank CSV imports with the
right date column chosen, quoted thousands separators parsed and the credit
classified as income.

What remains untested is a **hosted** project, and the difference is not
cosmetic: the CLI connects as a superuser, so it cannot tell you whether your
project's role is allowed to put a trigger on `auth.users` (migration `0004`) or
policies on `storage.objects` (`0005`). Both carry a comment naming the error to
expect and the manual fallback. Receipt upload works locally, but it is the
feature that leans hardest on those Storage policies, so it is the one most
worth retesting once your own project is up.

Treat the first `db:push` against your own project as the real test, and expect
to fix something.

The default currency is **SGD** with `en-SG` formatting and the
`Asia/Singapore` timezone. Change any of those under Settings.

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

Two migrations write to tables this project does not own. If `0004` fails with
`must be owner of relation users`, or `0005` with `must be owner of relation
objects`, create those objects from the dashboard instead — the trigger under
**Database → Triggers**, the four receipt policies under **Storage → Policies**
— using the expressions in the files. Everything else is ordinary `public`
schema and will apply as written.

### 4a. Run it locally against containers instead

If you have Docker, you can have the whole stack — Postgres, Auth, Storage, a
mail catcher — without a hosted project at all:

```bash
npx supabase start    # prints the local URL and keys for .env.local
npx supabase db reset # re-applies every migration from scratch
```

Magic-link emails are captured at <http://127.0.0.1:54324> rather than sent.
`supabase/config.toml` already lists both callback URLs; the sign-in failure it
prevents is described in that file.

### 5. Enable sign-in

In **Authentication → Providers**, email is on by default (used for magic
links). To enable Google, add your OAuth client ID and secret there.

In **Authentication → URL Configuration**, add your redirect URLs:

```
http://localhost:3000/auth/callback
https://<your-vercel-domain>/auth/callback
```

This step is load bearing, and it fails quietly. Supabase does not reject an
unlisted redirect target — it substitutes the project's Site URL instead. The
magic link then arrives pointing at a different origin, the PKCE `code_verifier`
cookie is not sent with it, and you land back on `/login` with an unusable
`?code=` in the address bar and no error anywhere. If sign-in bounces, this is
why.

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

## Offline

Install the app from your phone's browser menu and quick add keeps working with
no signal. An entry made offline is validated on the device with the same schema
the server uses, stored in IndexedDB, and sent when the connection returns —
automatically when you come back online or when you next focus the tab.

Each queued entry carries a `client_uuid` generated on the device, and the
database has a unique index on `(user_id, client_uuid)`. A flush that half
succeeded and is retried therefore inserts nothing twice.

Only writes are queued. Reading needs a connection, because a stale balance
shown as current is worse than no balance. The service worker in `public/sw.js`
is hand-written rather than generated: the bundler-integrated options do not
support Turbopack, which Next 16 builds with, and silently produced no worker at
all. Cached pages are cleared on sign-out, since they are HTML belonging to
whoever was signed in.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Scaffold, auth, shell, schema, RLS | Done |
| 1 | Categories, accounts, transactions CRUD, quick add | Done |
| 2 | Recurring engine, budgets, warning indicators | Done |
| 3 | Dashboard, FIRE coverage, savings rate, runway | Done |
| 4 | Excel and PDF export | Done |
| 5 | PWA install and offline quick add | Done |
| 6 | Receipt photos, CSV import | Done |
| 7 | Goals, debts, net worth | Done |
