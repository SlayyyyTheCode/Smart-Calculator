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

Not built. `npx cap add ios` needs Xcode and therefore a Mac.

## One caveat still open

**`persisted` is false by default.** The browser may evict OPFS under storage
pressure. A real build must call `navigator.storage.persist()` and handle
refusal, or a finance app can lose a year of records to a low-disk warning
nobody read. Capacitor's native storage is not subject to this; the installable
web version is.

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

### The rate limit was in the wrong place

The obvious design puts an attempt counter on the pairing session, and it does
nothing. A guessed code that does not exist never reaches a session, so the
counter only ever saw *correct* codes — somebody walking through all million
possibilities would have met nothing but `404`s and no resistance at all. Six
digits is not much to guess.

Counting failures per caller is what actually bounds it. Behind a proxy that
needs the forwarded address, and behind a shared NAT it is blunt — but a blunt
limit that fires beats a precise one that cannot.

The code is still not the security boundary. Two minutes, one claim, and the
confirmation word are.

## Not done yet

**iOS.** Needs Xcode, and therefore a Mac.

**Store submission.** Needs your own developer accounts, signing certificates
and store listings, and Apple requires in-app purchase for paid digital goods
(15–30%). None of it is something this repository can do on your behalf.

**A hosted relay and broker.** Both run on localhost here. The relay holds only
ciphertext and the broker only relays it, so neither is sensitive to host — but
they do have to be somewhere both devices can reach, over TLS.

Screens still to convert: recurring rules, CSV import and settings. Export to
Excel and PDF is untouched here; those modules are pure and already tested, but
they run on a server in the shipped app and would need to run on the device.
