# Smart Planner, local-first (v2)

The app running on the device: SQLite in the browser, **no account, no server,
nothing to sign up for**. This is L1 of the local-first plan.

```bash
npm install
npm run dev            # http://localhost:5174
npm run typecheck
npm run test           # every suite (needs the services, below)
npm run build
npm run preview        # http://localhost:5175
npm run test:cold      # offline cold start, against the production build
```

`npm run typecheck` exists because for a long time nothing checked this
workspace: the root config excludes it and Vite transpiles without checking. The
first run found that every row type was `never` — `InferRow` takes a Query, and
it had been handed a table definition — and that two delete buttons were sending
a boolean where Evolu wants `0 | 1`. The types were decorative and one of them
was hiding a button that did nothing.

Tests use `playwright-core` from the parent project. The sync and pairing tests
need the two services:

```bash
docker compose up -d          # relay on 4000, pairing broker on 4100
```

Neither can read your data — the relay holds ciphertext under an opaque owner
id, the broker relays a public key and a ciphertext for two minutes — so where
they run is a deployment choice rather than a trust decision. Point a build at
real ones:

```bash
VITE_RELAY_URL=wss://relay.example.com \
VITE_PAIRING_BROKER=https://pair.example.com \
npm run build
```

Both need TLS in production. Not to protect the payloads, which are already
encrypted, but because a browser on an `https` page refuses to talk to `ws://`
or `http://`.

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

## Installing it, and starting with no network (L5)

`npm run build` emits a service worker that precaches the shell — 15 entries,
2.2 MB, including the 1 MB SQLite wasm. That last file is the one that matters:
without it the database cannot open and every screen reads empty, which looks
exactly like data loss and is not.

`npm run test:cold` builds the case against the production preview:

- the manifest supports an install (4 icons, `standalone`)
- the service worker activates and the wasm is in the cache
- **with the network cut**, a full reload starts the app, the data is still
  there, a new entry can still be recorded, and a *second* cold start works too
  — so the first was not a warm page cache

That closes the caveat this README carried through L1 and L2.

### Android

`android/` is a real Capacitor project and it builds:

```bash
npm run build                 # the web bundle first — Capacitor ships dist/
npx cap sync android
cd android && ./gradlew assembleDebug
```

The result is `android/app/build/outputs/apk/debug/app-debug.apk` — about 4.8 MB,
`com.smartplanner.app`, minSdk 24, targetSdk 36, v2-signed with the Android
debug key, and carrying the whole web app inside it including the 1 MB SQLite
wasm. Sideload it and the planner runs with no server at all.

You need a JDK 17+ and an Android SDK with `platforms;android-35` and
`build-tools;35.0.0`, and `android/local.properties` pointing at it (gitignored,
because it is a path on one machine).

**If Gradle or `sdkmanager` fails with `PKIX path building failed`,** something
is intercepting TLS — a corporate proxy or a security product. Its certificate
authority is in the Windows trust store, which is why `curl` and the browser
work, and not in Java's own `cacerts`, which is why only Java fails. Point Java
at the OS store instead of chasing the download:

```
JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT
```

`androidScheme: "https"` in `capacitor.config.ts` is not cosmetic. Under
Capacitor's default `http` scheme the WebView is not a secure context, and
without a secure context there is no OPFS. The app would launch, find no
storage, and quietly hold everything in memory until the process was killed.

### A release build for Play

Play wants an `.aab` signed with a key you own. Generate it once and keep it:

```bash
cd android
keytool -genkeypair -v -keystore upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12
cp keystore.properties.example keystore.properties   # then fill in the passwords
./gradlew bundleRelease
```

Out comes `app/build/outputs/bundle/release/app-release.aab`, about 3.7 MB.

Both `keystore.properties` and `*.jks` are gitignored, and were gitignored
before either existed. **Google Play binds your listing to this key.** Lose it
and you cannot publish updates to your own app ever again — not a support
problem, a dead end. Back the `.jks` up somewhere that is not this laptop.

Without the key the release build does not fail; it simply produces an unsigned
artefact, so `assembleDebug` still works on a machine that has never seen it.

This pipeline was proved with a throwaway key, which was then deleted: the AAB
came out structurally correct (`BUNDLE-METADATA`, `base/dex`, the web assets and
the SQLite wasm inside) and the matching release APK verified under
`apksigner` with v2 signing. Nothing signed with that key is in the repository,
and the key itself is gone.

### iOS

`ios/` is a real Capacitor project now and `npx cap sync ios` copies the build
into it. Compiling and signing needs Xcode, and therefore a Mac:

```bash
npm run build && npx cap sync ios
npx cap open ios      # macOS only
```

## Storage durability

OPFS is best-effort by default: under disk pressure a browser may evict it, and
here that is not a cache miss but a year of somebody's finances with no server
copy to restore from — because having no server copy is the whole design.

`navigator.storage.persist()` is requested once at startup. Browsers decide for
themselves: an installed PWA is usually granted it silently, a page opened once
may be refused. Refusal is not an error and does not interrupt anything, but it
is shown in Settings, because the alternative is losing records to a low-disk
warning nobody read.

Capacitor builds are not affected — the native container's files are the app's
own. This matters for the installable web version.

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

## Pairing with a code (L4)

Typing 24 words is the fallback, not the path. Device A shows a six-digit code;
device B enters it and the phrase crosses encrypted.

```bash
node pairing-server/server.mjs     # http://127.0.0.1:4100
node pairing.test.mjs
```

The broker relays two messages and is built to be useless to whoever runs it.
Device B makes an ephemeral P-256 key pair and publishes only the public half;
device A agrees a shared secret by ECDH and encrypts the phrase under it with
AES-GCM. The private half never leaves device B and the agreed key is never
transmitted, so a broker keeping every byte it ever saw still cannot open the
result.

`pairing.test.mjs` records every request the sending device makes to the broker
and then searches all of it for that device's own recovery phrase — the whole
phrase, and each of its 24 words individually. None of it is there.

Both devices also derive a confirmation from the key they agreed, never from
anything the broker sent, and show it. A substituted public key produces two
different words on two screens; matching words mean nothing got in between.

## Getting the data out, and how fast it goes

### Export

The point of a local-first app is that the data is yours, and that is only true
if you can take it somewhere else. The Export screen builds the file on the
device out of rows already in memory and hands it to the share sheet on a phone
or the downloads folder on a laptop. Nothing is uploaded to produce it — there
is no server that could keep a copy of the file it made you.

**CSV** for a spreadsheet, **JSON** for a real backup. Amounts in the CSV are
plain numbers — `1234.50`, never `$1,234.50` — because a currency symbol turns
the column into text the moment Excel opens it, and a column you cannot sum is
not much of an export. The JSON keeps amounts in cents, because converting money
to a decimal and back is where money goes missing.

`export.test.mjs` intercepts the download and reads the bytes rather than
checking that a button was clickable: the header, the row count, the date
ordering, that the range picker really restricts, that a salary carries its CPF
and a dividend is labelled passive.

### The numbers

`npm run bench` measures against the production build with three years of
spending imported. Guessing would have been wrong three times over here, so the
figures are wall-clock from the browser.

Each figure is the range over repeated runs rather than one sample, because the
first set taken here was a single run and it was wrong by a factor of two and a
half — see the note below.

| | 500 rows | 2,000 rows | 6,000 rows |
|---|---|---|---|
| open dashboard | 84 ms | 84–85 ms | 82–85 ms |
| open transactions | 150 ms | 148–150 ms | 150–167 ms |
| record one expense | 83 ms | 84–99 ms | 83–100 ms |
| cold start with data | 670–705 ms | 674–720 ms | 687–738 ms |
| import | 0.90 s | 1.95–2.47 s | 5.6–6.7 s |
| durable writes | 556/sec | 811–1,026/sec | 900–1,069/sec |

Reading a screen does not get slower as the database grows: opening the
transactions list is 150 ms at five hundred rows and 150 ms at six thousand.
Importing is linear, because every row is a separate durable write.

**The interesting one was the transactions screen at 25.8 seconds**, and it was
none of the things it looked like. Not the DOM: windowing the list to 100 rows
barely moved it. Not the dev server: the production build was the same. Chrome's
own counters settled it — **230 ms of main-thread work out of 13,811 ms**. The
screen was waiting on the SQLite worker.

The worker was still writing the import. `evolu.insert` returns when the write
is *queued*, not when it is durable, so the loop finished in 365 ms, the screen
said "Imported 6000", and the worker carried on for another thirteen seconds.
Nothing was broken and nothing looked wrong — the next screen you opened simply
hung, after the app had already told you it was done.

So the fix was to stop lying rather than to make anything faster. `onComplete`
fires per row when the worker has actually taken it, so the progress bar and the
"Imported" message are the worker's count, not the loop's. The import now
honestly reports the time it takes — around **6 seconds for 6,000 rows**, near a
thousand durable writes a second, which is Evolu's per-row mutation cost since
there is no batch API — and every other screen dropped to about 150 ms because
nothing is queued behind it any more.

**A correction worth keeping.** The first version of this table said 16 s and
~370 rows/sec for that import. That was one run, and repeating it four times
gives 5.6–6.7 s and 900–1,069 rows/sec under the same conditions — thirteen
containers up, CPU at 7%. A single sample of a number that varies is not a
measurement, and quoting it made the app look two and a half times slower than
it is. The figures above are ranges over repeats for that reason.

Two real fixes came out of the same investigation and are worth keeping:
reloads are throttled to one every 250 ms, because nine subscriptions each
triggering a reload of all nine queries meant a burst of writes re-ran a
full-table query thousands of times; and the transaction list renders a hundred
rows at a time with a **Show more**, because rendering six thousand is work
nobody asked for.

Daily use — the thing this app is actually for — is **under 100 ms to record an
expense** and **about 700 ms to cold start** with three years of history, and
neither moves as the database grows.

### The expense categories

Sixteen ship with a new install — Food, Social Life, Self-Development,
Transportation, Culture, Household, Apparel, Beauty, Health, Education, Gift,
Electronic, Tax, Lottery, Donation/Prayer, Miscellaneous — replacing the six
placeholders the spike started with. Six is enough to demo and not enough to
use: the first thing anybody does with a six-category planner is find their
spending does not fit it, and a row filed under the wrong heading is worse than
one left uncategorised, because it is wrong in a way the totals do not show.

The seventeenth is that there is no seventeenth. **+ New category…** sits at the
bottom of the picker on the entry screen, so a category can be created at the
moment it is needed rather than by breaking off to visit Settings — which is
the only time anybody notices the list is missing something. The new one is
selected immediately so recording carries straight on.

Its `kind` follows the direction being recorded. Adding one while entering
income cannot produce a category filed as an expense that then never appears
again, and `categories.test.mjs` checks both directions of that leak along with
survival across a restart.

Colours sweep the hue wheel once so sixteen dots stay tellable apart, with a
neutral slate on Miscellaneous — a catch-all should not look like a category
with an opinion — and none of them collide with the income colours.

### Income categories, CPF, and take-home pay

Income splits into eight categories — Gross Income, General Income, Freelance
Income, Commissions and Fees, Dividend, Interests, Royalties, Capital gains —
and each one carries whether it is **active or passive**. That lives on the
category rather than being asked per entry, because it is a property of the
income: a dividend is passive every time. Asking each time invites two
different answers for the same thing, and the FIRE figure is measured against
passive income, so a slip there quietly moves the one number the plan turns on.

Gross Income carries a CPF flag — a flag rather than a match on the name,
because the name belongs to the user and they may rename it.

**The rates are the CPF Board's, from the Board.** `src/lib/domain/cpf.ts` is
built from *CPF contribution rates from 1 January 2026*, Tables 1–3, and the
unit tests assert against the Board's own stated maximums rather than against
this implementation — Table 1 gives "Max. of $1,600" for an employee's share,
and 0.20 × $8,000 = $1,600, which is also how the $8,000 Ordinary Wage ceiling
was confirmed rather than assumed.

Four things that are easy to get wrong and are therefore tested:

- **Only the employee's share is deducted.** The employer's 17% is real money
  going into the same CPF accounts, but it was never in the gross figure a
  person types in, so subtracting it would understate their income.
- **The band boundary sits on the older side of the birthday.** "55 and below"
  then "above 55 to 60" means exactly 55 is still the first band.
- **Between $500 and $750 the contribution phases in** at `k × (wage − $500)`,
  where `k` comes from the table and is *not* derivable from the percentage.
- **The employee's share is rounded down to whole dollars**, per the Board's
  step 2. Skipping that overstates the deduction by up to 99 cents a month.

A simplification, checked rather than assumed: for 1st- and 2nd-year PRs the
Board publishes both Graduated/Graduated and Full-employer/Graduated-employee
schemes. They differ only in the **employer's** column — the employee's is
identical — so the F/G election cannot change take-home pay, and the app does
not ask about it.

The contribution is **stored on the transaction**, not recomputed for display.
It is a fact about that payment; recomputing would restate an old payslip under
today's age band and silently rewrite history every birthday. `cpf.test.mjs`
changes the date of birth after recording a salary and checks the old figure
does not move.

### Currency and locale were hardcoded in nine files

`const CURRENCY = "SGD"` and `const LOCALE = "en-SG"` appeared in nine screens.
Nine copies of a decision is nine chances for eight of them to be missed, and it
made the app unshippable anywhere but Singapore — which is the point of putting
it in a store. They live in the database now, not in localStorage, because they
describe the money rather than the device: a phone and a laptop showing one
account in two currencies would be a bug.

`parameters.test.mjs` changes the setting and then checks the dashboard, the
transaction list, budgets, income, net worth, import, goals and debts all
followed — German formatting on purpose, because `1.234,50` inverts both
separators against `1,234.50`, so a screen still on the old setting is
unmistakable rather than subtly wrong.

**The validation I wrote first was based on a false premise.** I assumed
`Intl.NumberFormat` throws on an unknown currency, so I wrapped it in a
try/catch and called that validation. It does not. It rejects a *malformed*
code — anything that is not three ASCII letters — but `"XYZ"` is three letters,
so it is accepted and printed verbatim. The test caught it: every amount on
every screen read `1.234,50 XYZ`, with no error anywhere. Nothing crashing is
exactly why it would have shipped. The check is now against
`Intl.supportedValuesOf("currency")`, which is the real list: 162 entries, SGD
in it, XYZ not.

### Nothing leaves the device

The claim the whole design rests on, so it is measured rather than asserted.
`offline-privacy.test.mjs` records every request the page makes while an amount
and a category are entered, then checks three things: that no request goes
anywhere but this origin, that the amount appears in none of them, and that the
category name does not either. Latest run: **738 requests, all local, neither
value present in any of them.** Then it cuts the network entirely and records
another expense, which works, because there was never anything on the other end.

### Opening it on a phone

```
npm run build
npm run certs        # writes local-first/certs, gitignored, 365 days
npm run preview:lan  # prints the addresses to use
```

Then on the same Wi-Fi, `https://<your-address>:5175`, and accept the
certificate warning once per device.

The TLS is not a security measure — it is self-signed and every browser will
say so. It is there because of a mechanical requirement. The database is SQLite
in OPFS; browsers only expose OPFS to a cross-origin-isolated page, and
isolation requires a **secure context**. `localhost` qualifies, a bare
`http://192.168.x.x` does not. Served over plain HTTP to a phone the app loads,
looks completely normal, and holds everything in memory — every entry gone on
the first refresh. A working-looking app that loses your data is worse than no
link at all.

Verified over the real network address, not just localhost:
`isSecureContext: true`, `crossOriginIsolated: true`, OPFS present, and an entry
still there after a reload.

Windows blocks the port by default. Once, as administrator:

```powershell
New-NetFirewallRule -DisplayName "Smart Planner LAN preview (5175)" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5175 -Profile Private
```

Undo it with `Remove-NetFirewallRule -DisplayName "Smart Planner LAN preview (5175)"`.

`npm run preview` is unchanged: HTTP, localhost only. The LAN mode is behind
`LAN=1` rather than "on if a certificate happens to exist", so generating one
never silently changes what the test suite is talking to, and never quietly
exposes the default server to the network.

### The app did not know what day it was

Five hardcoded dates — `"2026-08-09"` in three screens, `"2026-08-01"` in the
shell, and the literal string `"August 2026 so far."` twice on the dashboard —
froze the whole thing in time. Installed on a phone it would have dated every
entry 9 August 2026 for ever, shown August's dashboard in December, and counted
a debt payoff from a date that never advanced. Every test passed throughout,
because none of them had ever asked what month it was.

`src/today.ts` is the one place that answers now, using the shipped `todayIso`
with the device's own time zone — deriving a calendar date from a UTC instant is
what puts a Sunday evening expense on Saturday for anyone west of Greenwich, and
Singapore is eight hours the other way.

A `?today=` override keeps the tests deterministic now that the clock is real.
Without it they would pass this month and fail in September, which is worse than
either a frozen clock or a working one: a suite that lies about when it is
telling the truth.

Two things fell out of it immediately. Quick add had no date field at all, so a
receipt from yesterday could not be recorded as yesterday — it has one now,
defaulted to today. And the overall budget was looked up by category alone, so
setting a cap in September found August's and rewrote it, leaving September with
none and August with the wrong figure. Harmless while the clock was frozen,
which is exactly why it survived: with the date stuck in August there was only
ever one month. `clock.test.mjs` moves the same device across a month boundary
and back, and checks the money, the labels and the caps all follow.

### Importing the same statement twice

Recurring rules got an idempotency test because double-posting rent is
double-counting money. Importing is the same money and an easier mistake to
make: statements overlap, downloads get repeated, and a file picker gives no
hint you have opened this file before. Measured: a three-row export imported
twice took the month from **$109.60 to $219.20**, silently.

The server version was no better — `client_uuid` is generated per row, so a
second pass simply makes new ones — and its only protection was being able to
undo a batch afterwards.

Rows are now matched on date, amount, direction and what the bank called them,
and the count is stated in the preview before anything is written. The matching
is a **multiset difference**, not a set membership test, and that distinction is
the whole difference between fixing the bug and causing its mirror image: two
identical coffees on the same day are two real expenses, and "have I seen this
fingerprint before" would eat the second one and understate the month. Counting
occurrences and cancelling them off one at a time means a file re-imported whole
is skipped whole, while a file with one more coffee than last time imports
exactly that one coffee. `import-twice.test.mjs` checks both directions, and
that unticking the box still imports everything — someone who really did pay
twice has to be able to say so.

While it was open: the transaction list showed the category and nothing else, so
a freshly imported statement was thirty rows all reading "Uncategorised". It
falls back to the merchant now.

### The rate limit was in the wrong place

The obvious design puts an attempt counter on the pairing session, and it does
nothing. A guessed code that does not exist never reaches a session, so the
counter only ever saw *correct* codes — somebody walking through all million
possibilities would have met nothing but `404`s and no resistance at all. Six
digits is not much to guess.

Counting failures per caller is what actually bounds it. Behind a shared NAT
that is blunt — but a blunt limit that fires beats a precise one that cannot.

Then it was in the wrong place a second time. The counter went on the *claim*
route, because that is the route that pairs a device. Three other routes take
the same six-digit code, and all three answered the question an attacker
actually asks — does this code exist? — for free. So: enumerate on the poll
route at no cost until one answers `200`, then spend your single allowed claim
on a code you already know is live. Measured before the fix, **320 of 400
guesses landed**; after, none. Every route that takes a code now goes through
one lookup that counts the miss, which is the same "one implementation per
rule" the money math gets, applied to a limit.

Only failures count, and that is what keeps it off the real flow: the sender
polls its own valid code the whole time it waits, and the receiver polls for
its own sealed payload. `broker.test.mjs` pins that down *first* — forty polls
on each route, unthrottled — because a limit that breaks pairing would be a
worse bug than the one being fixed.

Behind a reverse proxy every caller arrives from the proxy's address and one
attacker would lock out everybody, so set `TRUSTED_PROXY_HOPS` to the number of
proxies in front of the broker. Hops are counted from the **right**: the
rightmost entry is the one your own proxy appended and the only one it
observed, while everything to its left was supplied by whoever was calling and
can be invented. Taking the leftmost is the usual mistake and it is what makes
the header spoofable — there is a test that prepends a made-up address and
still gets refused.

The code is still not the security boundary. Two minutes, one claim, and the
confirmation word are.

### And the confirmation word could not be read

The receiving device derived it, set it into state, and adopted the phrase in
the same breath — which reloads the page. React does not paint before a reload,
so that screen never appeared. The one control that makes a six-digit code
worth trusting existed on the sending device only, and the test had only ever
looked there.

Now what arrives is held rather than adopted: the receiver shows its word and
waits for **the codes match — continue**. Asking after adopting is asking about
something already done. The test compares the two words across both devices and
requires them equal, which is the check the design always claimed and never
made.

While it was open: the phrase from a pairing was stored without being parsed,
unlike the typed-phrase form, which validates. That is not a failed pairing —
the mnemonic is parsed at module scope, so a bad value throws before anything
renders, and it is in `localStorage`, so it throws again on every load
afterwards. A blank screen with no way back from inside the app. It is now
validated on arrival, and `readSyncConfig` refuses an unusable one and clears
it, which turns the worst case into "sync is off" — a state this app is built
to be complete in.

## Not done yet

**iOS.** The Xcode project exists (`local-first/ios`) and Capacitor syncs the
build into it. Compiling and signing it needs Xcode, and therefore a Mac:

```bash
npm run build && npx cap sync ios
npx cap open ios      # macOS only
```

Android is verified here — `npx cap sync android && ./gradlew assembleDebug`
produces `android/app/build/outputs/apk/debug/app-debug.apk`. Two things that
cost time: Gradle needs `JAVA_HOME` set (any JDK 21), and if the build fails
with *"Unable to delete directory ... packageDebug\tmp"* that is OneDrive or a
stale daemon holding the folder, not the code — `./gradlew --stop`, delete
`app/build/intermediates/incremental/packageDebug`, build again.

**Store submission.** Needs your own developer accounts, signing certificates
and store listings, and Apple requires in-app purchase for paid digital goods
(15–30%). None of it is something this repository can do on your behalf.

**A hosted relay and broker.** Configs for Fly are in `deploy/` and
`pairing-server/fly.toml`, with the commands in `deploy/README.md`. Both fit the
free allowance. `TRUSTED_PROXY_HOPS = "1"` is already set on the broker, which
matters: Fly terminates TLS and forwards, so without it every caller looks like
Fly's proxy and one attacker guessing codes locks out everybody.

Export to Excel and PDF is untouched here. Those modules are pure and already
tested, but they run on a server in the shipped app and would need to run on
the device.
