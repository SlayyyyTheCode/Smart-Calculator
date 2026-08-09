# Smart Planner, local-first (v2)

The app running on the device: SQLite in the browser, **no account, no server,
nothing to sign up for**. This is L1 of the local-first plan.

```bash
npm install
npm run dev                 # http://localhost:5174
node screens.test.mjs       # needs playwright-core from the parent project
```

## The point

Every figure on screen is computed by the **same rule modules the deployed web
app uses**, imported directly from `../src` rather than copied:

```ts
import { evaluateBudget } from "@app/lib/domain/budget";
import { fireCoverage, largestExpense, runwayMonths, savingsRate } from "@app/lib/domain/metrics";
import { formatMoney } from "@app/lib/money";
```

Nothing in `repository.ts` reimplements a rule. It shapes rows out of SQLite and
hands them to functions that already exist and are already tested. If a
threshold changes in `src/lib/domain`, it changes here too, and a divergence
becomes a build error instead of two codebases quietly disagreeing about what
your money did.

That reuse is possible because the domain layer imports nothing but itself,
`money` and `date` — no Supabase, no Next, no `server-only`.

## The screens

L2 replaced the L1 scratch UI with real screens — dashboard, quick add, budgets
— built from the **shipped design system**, not a second copy of it:
`StatTile`, `Meter`, `CategoryBars`, `Card`, `Field`, `Segmented`,
`ProgressBar`, `BUDGET_LEVEL_STYLES`. `src/styles.css` imports the app's own
`globals.css`, so the tokens, the validated chart colours and dark mode all come
across as they are.

## What the test proves

`screens.test.mjs` cuts the network immediately after first load and does
everything after that with no server of any kind reachable, on a 390px phone
viewport:

- the shipped stylesheet is actually applied — a reused component with no CSS
  looks right in the source and broken on screen
- 85 spent against a 100 cap renders **Close to limit**; 115 renders
  **Exceeded**, on the budgets screen and again on the dashboard
- a recurring estimate is stored as a draft and moves **no** total
- amounts are read back out of SQLite as integer minor units — `8500`, `3000`,
  `50000` — never a float
- nothing overflows horizontally at 390px
- the data and the budget state survive a restart
- dark mode applies

## Two honest caveats

**A cold load still needs the network.** There is no service worker in L1, so
the HTML, the JS and the SQLite wasm worker have to be fetched. Cut the
connection midway through a reload and the database never opens and every count
reads zero — which looks exactly like data loss and is not. Offline *use* works;
offline *cold start* is L5's job.

**`persisted` is false by default.** The browser may evict OPFS under storage
pressure. A real build must call `navigator.storage.persist()` and handle
refusal, or a finance app can lose a year of records to a low-disk warning
nobody read.

## Modelling notes

`NONE` is a sentinel, not decoration. Evolu's string types are non-empty by
construction, so "no category" needs a value, and it has to be spelled the same
in the writer and the reader. It was not, at first: the UI wrote `"-"` and the
repository tested for `""`, so the overall budget was read as a budget for a
category that does not exist and reported `$0.00 of $100.00 — ok` while $115 sat
unspent against it. One constant, defined once, in `schema.ts`.

`aprBps` holds the interest rate in basis points so the rate is an integer too,
for the same reason amounts are minor units.

There is no `user_id` column anywhere. There are no other users on the device.
The owner key is the boundary that row level security used to be.

`CategoryBars` ranks by taking the first row as the maximum, which is correct
only if the caller sorted. This repository did not, and a later, larger row
computed a width above 100% — an 895px bar inside a 390px phone. Both ends are
fixed: the repository sorts, and the component now derives its maximum across
every row, because a wrong emphasis is cosmetic and a bar hanging 500px off the
side of the page is not.

## Not done yet

L3 (opt-in encrypted sync), L4 (device pairing code and recovery phrase), L5
(Capacitor shell and offline cold start), L6 (store submission).

Screens still to convert: transactions, recurring, income, goals, debts, net
worth, import and settings. The pattern is set by the three that exist — read
from `usePlannerData`, shape in `repository.ts`, render with the shipped
components — so the rest is repetition rather than design.
