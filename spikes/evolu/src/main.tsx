import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { makeEvolu, type TransactionRow } from "./schema";

/**
 * Two "devices" are two browser contexts pointed at this page with a different
 * ?device= name, so each gets its own local SQLite database, and the same
 * ?mnemonic= so both hold the same owner — one account, two devices.
 */
const params = new URLSearchParams(location.search);
const device = params.get("device") ?? "A";
const relay = params.get("relay") ?? "ws://localhost:4000";
const mnemonic = params.get("mnemonic") ?? "";

const { evolu, owner } = makeEvolu(`spike-${device}`, relay, mnemonic);

const allTransactions = evolu.createQuery((db) =>
  db
    .selectFrom("transaction")
    .selectAll()
    .where("isDeleted", "is not", 1)
    .orderBy("amountMinor"),
);

function App() {
  const [rows, setRows] = useState<readonly TransactionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      void evolu.loadQuery(allTransactions).then((r) => setRows(r as TransactionRow[]));
    };
    load();
    const un = evolu.subscribeQuery(allTransactions)(load);
    const unErr = evolu.subscribeError(() => setError(JSON.stringify(evolu.getError())));
    return () => {
      un();
      unErr();
    };
  }, []);

  const add = () => {
    const amount = Number((document.getElementById("amount") as HTMLInputElement).value);
    // Mutations return a Result rather than throwing, so a rejected write shows
    // up instead of vanishing.
    const result = evolu.insert("transaction", {
      occurredOn: "2026-08-09",
      // Minor units, exactly as the real app stores money.
      amountMinor: Math.round(amount * 100),
      direction: "expense",
      expenseNature: "daily",
      note: `from device ${device}`,
    });
    if (!result.ok) setError(JSON.stringify(result.error));
  };

  return (
    <main style={{ fontFamily: "system-ui", padding: 20, maxWidth: 640 }}>
      <h1 data-testid="device">Device {device}</h1>
      <p data-testid="owner">owner: {String(owner.id)}</p>
      {error ? <pre data-testid="error">{error}</pre> : null}

      <input id="amount" defaultValue="12.34" inputMode="decimal" />
      <button onClick={add} data-testid="add">
        Record
      </button>

      <h2 data-testid="count">Transactions: {rows.length}</h2>
      <ul data-testid="list">
        {rows.map((r) => (
          <li key={String(r.id)}>
            {String(r.occurredOn)} · {String(r.amountMinor)} minor · {String(r.note)}
          </li>
        ))}
      </ul>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
