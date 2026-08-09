# Spike: Evolu (local-first, end-to-end encrypted)

Answers one question with evidence rather than opinion: **can Smart Planner's
data live on the user's device, sync to their second device, and stay unreadable
to whoever runs the server?**

Result: yes, on all three counts.

## Running it

```bash
docker run -d --name evolu-relay -p 4000:4000 evoluhq/relay:latest
npm install
npm run dev                      # http://localhost:5173
node two-device-sync.test.mjs    # needs playwright-core from the parent project
```

The relay is deliberately run locally so its database can be opened and read:

```bash
docker cp inspect-relay.cjs evolu-relay:/app/inspect.cjs
docker exec -w /app evolu-relay node /app/inspect.cjs
```

## What the test proves

Two browser contexts are two devices — separate storage, same owner derived from
one mnemonic, which is what a pairing code would carry across in the real app.

- Both devices derive the same owner id from the mnemonic alone.
- An expense recorded on A appears on B, through the relay.
- An expense recorded on B travels back to A. Sync is bidirectional.
- Amounts survive as integer minor units. `12.34` is stored and read back as
  `1234`, never as a float.

## What the relay can see

Nothing. Its entire schema is:

```
evolu_message    ownerId:BLOB  timestamp:BLOB  change:BLOB
evolu_timestamp  evolu_usage   evolu_writeKey
```

`change` is an opaque ciphertext blob. Searching the relay's database file for
`from device A`, `2026-08-09`, `expense`, `daily`, `1234`, `transaction`,
`occurredOn` and `amountMinor` finds none of them — not the values, not the
table name, not the column names. The server cannot tell it is storing a finance
app's data, let alone read it.

That is the property the app needs: *their* devices, not ours.

## The cost of that property

If a user loses every device and has no mnemonic, their data is gone. The
ciphertext on the relay is unopenable by anybody, including us. Any design built
on this must show the recovery phrase at setup and mean it.

## What is modelled

The schema mirrors the real app deliberately, so the spike answers a question
about this codebase and not a toy:

- `amountMinor` — integer minor units, the rule the whole app is built on.
- `occurredOn` — a `YYYY-MM-DD` calendar date string, never an instant.
- `direction` and `expenseNature` — the daily / fixed / recurring split.

## Does the existing domain layer survive?

Yes. `src/lib/domain/*`, `money.ts` and `date.ts` import nothing from Supabase,
Next, or `server-only` — only each other and the generated database types. The
budget thresholds, the metrics, the recurrence date maths and the debt
amortisation are pure functions over plain values, so they run unchanged against
rows from a local SQLite database. Only the generated types need swapping.
