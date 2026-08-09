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

## The screens that exist

Dashboard, quick add, budgets, transactions, income, goals, debts and net
worth. Four tabs fit across a phone, so the rest live behind **More**.

Each one reuses a shipped domain module rather than reimplementing it, and the
test checks the arithmetic rather than that the page merely rendered:

| Screen | Module | Checked |
| --- | --- | --- |
| Budgets | `evaluateBudget` | 85% amber, 115% red |
| Dashboard | `largestExpense`, `savingsRate`, `runwayMonths` | ranked bars, 97.7% |
| Income | `fireCoverage` | active and passive kept apart |
| Goals | `goalProgress` | $600 a month for $6,000 by Jun 2027 |
| Debts | `projectPayoff`, `summariseDebts` | clears 2029-09-09, $1,587.87 interest; 13.50% weighted rate |
| Net worth | `computeNetWorth` | $506,885 assets − $25,000 debts = $481,885 |

The debt screen also carries the case worth having: a payment below the monthly
interest is called out — *"never clears it — interest alone is $200.00 a month.
Pay at least $200.01"* — rather than projected out for a century, which would be
technically true and useless.

## Sync (L3)

Off by default. With it off the app is complete and nothing has ever left the
device. Turning it on adopts the owner this device already has, adds a relay
transport, and starts exchanging encrypted copies.

Pairing a second device is done with the 24-word recovery phrase: reveal it on
the first device, enter it on the second. `node sync.test.mjs` drives exactly
that against a relay of our own, and then reads the relay's database:

- sync is off on a fresh device and says so
- the phrase stays hidden until asked for — a phrase on screen is a key on
  screen
- an invalid phrase is refused with a readable message, at the point of entry
  rather than at the next startup with a broken database
- device B receives device A's `$42.42`, and a `$13.13` recorded on B comes back
  to A
- the relay ends up holding **one** owner and no readable content: searching its
  file for `42.42`, `13.13`, `Groceries`, `Food & Dining`, `transaction`,
  `amountMinor`, `occurredOn`, `expense`, `daily` and `confirmed` finds none of
  them

### Two things this got wrong first, worth keeping written down

**Turning on sync must adopt the owner the device already has.** Minting a fresh
one looks equivalent and is not: everything recorded so far belongs to the owner
Evolu created when the database was first opened. A new owner syncs an empty
account and strands the real history under a key nothing points at — the user
turns on sync and watches their records disappear.

**Pairing a used device needs an explicit intent, not a comparison.** Handing a
different `externalAppOwner` to a database that already exists does not re-key
it; the rows stay under the owner they were written with and the relay quietly
accumulates two owners that never converge. `restoreAppOwner` is the operation
for it, and it is destructive, so it must run only when the user actually asked
to replace this device's data. Deciding that by comparing mnemonics cannot work,
because both cases look identical once the config is written. The config records
what the user chose instead.

### What is not built

The **six-digit code** flow — device A shows a short code, a broker authorises
device B, and the key crosses without anyone typing 24 words — needs a pairing
service to sit between them. It is the better experience and it is a real piece
of work, not a refinement of this. What exists today is the phrase, which is the
same security with worse ergonomics.

## Not done yet

L4's six-digit pairing code (see above), L5 (Capacitor shell and offline cold
start), L6 (store submission).

Screens still to convert: recurring rules, CSV import and settings. Export to
Excel and PDF is untouched here; those modules are pure and already tested, but
they run on a server in the shipped app and would need to run on the device.
