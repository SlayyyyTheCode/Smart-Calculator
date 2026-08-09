import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { formatMoney } from "@app/lib/money";

import { budgetStatuses, monthMetrics, type LocalBudgetStatus, type LocalMetrics } from "./repository";
import {
  createLocalDb,
  NONE,
  type AccountRow,
  type BudgetRow,
  type CategoryRow,
  type TransactionRow,
} from "./schema";

/**
 * L1: the app running entirely on the device.
 *
 * No account, no sign-in, no server — `createLocalDb` is called without a
 * mnemonic, so there is no relay and nothing to sync to. Everything on screen
 * is computed from SQLite in the browser by the same rule modules the deployed
 * web app uses.
 */
const params = new URLSearchParams(location.search);
const instance = params.get("instance") ?? "planner";
const PERIOD = "2026-08-01";

const { evolu } = createLocalDb({ instanceName: `local-${instance}` });

const allCategories = evolu.createQuery((db) =>
  db
    .selectFrom("category")
    .selectAll()
    .where("isDeleted", "is not", 1)
    // Ordered because a picker whose entries move between renders is unusable,
    // and because anything asserting "the first category" needs it to be a
    // stable thing to assert about.
    .orderBy("sortOrder"),
);
const allAccounts = evolu.createQuery((db) =>
  db.selectFrom("account").selectAll().where("isDeleted", "is not", 1),
);
const allTransactions = evolu.createQuery((db) =>
  db.selectFrom("transaction").selectAll().where("isDeleted", "is not", 1),
);
const allBudgets = evolu.createQuery((db) =>
  db.selectFrom("budget").selectAll().where("isDeleted", "is not", 1),
);

function App() {
  const [categories, setCategories] = useState<readonly CategoryRow[]>([]);
  const [accounts, setAccounts] = useState<readonly AccountRow[]>([]);
  const [transactions, setTransactions] = useState<readonly TransactionRow[]>([]);
  const [budgets, setBudgets] = useState<readonly BudgetRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      void evolu.loadQuery(allCategories).then((r) => setCategories(r as CategoryRow[]));
      void evolu.loadQuery(allAccounts).then((r) => setAccounts(r as AccountRow[]));
      void evolu.loadQuery(allTransactions).then((r) => setTransactions(r as TransactionRow[]));
      void evolu.loadQuery(allBudgets).then((r) => setBudgets(r as BudgetRow[]));
    };
    load();
    const subs = [
      evolu.subscribeQuery(allCategories)(load),
      evolu.subscribeQuery(allAccounts)(load),
      evolu.subscribeQuery(allTransactions)(load),
      evolu.subscribeQuery(allBudgets)(load),
      evolu.subscribeError(() => setError(JSON.stringify(evolu.getError()))),
    ];
    return () => subs.forEach((un) => un());
  }, []);

  const report = (result: { ok: boolean; error?: unknown }) => {
    if (!result.ok) setError(JSON.stringify(result.error));
  };

  /** The seed a freshly installed app gives you, with no server involved. */
  const seed = () => {
    report(
      evolu.insert("account", {
        name: "Cash",
        type: "cash",
        openingBalanceMinor: 200000,
        isLiquid: 1,
        isArchived: 0,
      }),
    );
    for (const [name, color, sortOrder] of [
      ["Groceries", "#f97316", 10],
      ["Transport", "#f59e0b", 20],
      ["Housing", "#84cc16", 30],
    ] as const) {
      report(evolu.insert("category", { name, kind: "expense", color, sortOrder, isArchived: 0 }));
    }
  };

  const addExpense = () => {
    const amount = Number((document.getElementById("amount") as HTMLInputElement).value);
    const categoryId = (document.getElementById("category") as HTMLSelectElement).value;
    report(
      evolu.insert("transaction", {
        occurredOn: "2026-08-09",
        amountMinor: Math.round(amount * 100),
        direction: "expense",
        incomeType: NONE,
        expenseNature: "daily",
        status: "confirmed",
        categoryId: categoryId || NONE,
        accountId: String(accounts[0]?.id ?? NONE),
        merchant: NONE,
        note: NONE,
        recurringRuleId: NONE,
      }),
    );
  };

  const addIncome = () => {
    report(
      evolu.insert("transaction", {
        occurredOn: "2026-08-01",
        amountMinor: 500000,
        direction: "income",
        incomeType: "active",
        expenseNature: NONE,
        status: "confirmed",
        categoryId: NONE,
        accountId: String(accounts[0]?.id ?? NONE),
        merchant: NONE,
        note: "Salary",
        recurringRuleId: NONE,
      }),
    );
  };

  const addDraft = () => {
    report(
      evolu.insert("transaction", {
        occurredOn: "2026-08-05",
        amountMinor: 12000,
        direction: "expense",
        incomeType: NONE,
        expenseNature: "recurring",
        status: "draft",
        categoryId: NONE,
        accountId: String(accounts[0]?.id ?? NONE),
        merchant: NONE,
        note: "Electricity estimate",
        recurringRuleId: NONE,
      }),
    );
  };

  const setOverallBudget = () => {
    const limit = Number((document.getElementById("limit") as HTMLInputElement).value);
    report(
      evolu.insert("budget", {
        periodMonth: PERIOD,
        categoryId: NONE,
        limitMinor: Math.round(limit * 100),
        warnThresholdPct: 80,
      }),
    );
  };

  // Every figure below comes from the shipped domain modules.
  const statuses: LocalBudgetStatus[] = budgetStatuses(budgets, transactions, categories, PERIOD);
  const metrics: LocalMetrics = monthMetrics(transactions, categories, accounts, PERIOD);
  const money = (minor: number) => formatMoney(minor, "SGD", "en-SG");

  return (
    <main style={{ fontFamily: "system-ui", padding: 20, maxWidth: 720 }}>
      <h1>Smart Planner — on device</h1>
      <p data-testid="offline-note">No account. No server. SQLite in the browser.</p>
      {error ? <pre data-testid="error">{error}</pre> : null}

      <button onClick={seed} data-testid="seed">
        Seed categories and account
      </button>

      <div style={{ marginTop: 12 }}>
        <input id="amount" defaultValue="85.00" inputMode="decimal" />
        <select id="category" data-testid="category">
          <option value="">Uncategorised</option>
          {categories.map((c) => (
            <option key={String(c.id)} value={String(c.id)}>
              {String(c.name)}
            </option>
          ))}
        </select>
        <button onClick={addExpense} data-testid="add-expense">
          Record expense
        </button>
        <button onClick={addIncome} data-testid="add-income">
          Record salary
        </button>
        <button onClick={addDraft} data-testid="add-draft">
          Add draft estimate
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <input id="limit" defaultValue="100.00" inputMode="decimal" />
        <button onClick={setOverallBudget} data-testid="set-budget">
          Set overall budget
        </button>
      </div>

      <h2>Budgets</h2>
      <ul data-testid="budgets">
        {statuses.map((s) => (
          <li key={s.budgetId} data-testid={`budget-${s.categoryName}`}>
            {s.categoryName}: {money(s.spent)} of {money(s.limit)} — {s.pctUsed.toFixed(2)}% —{" "}
            <strong data-testid="level">{s.level}</strong>
          </li>
        ))}
      </ul>

      <h2>Dashboard</h2>
      <dl data-testid="metrics">
        <dt>Spent</dt>
        <dd data-testid="spent">{money(metrics.totals.expense)}</dd>
        <dt>Income</dt>
        <dd data-testid="income">
          {money(metrics.totals.incomeActive + metrics.totals.incomePassive)}
        </dd>
        <dt>Savings rate</dt>
        <dd data-testid="savings">
          {metrics.savingsRate === null ? "—" : `${(metrics.savingsRate * 100).toFixed(1)}%`}
        </dd>
        <dt>Runway</dt>
        <dd data-testid="runway">
          {metrics.runwayMonths === null ? "—" : `${metrics.runwayMonths.toFixed(1)} months`}
        </dd>
        <dt>Largest expense</dt>
        <dd data-testid="largest">
          {metrics.largest
            ? `${metrics.largest.category.categoryName} ${money(metrics.largest.category.amount)}`
            : "—"}
        </dd>
      </dl>

      <h2 data-testid="tx-count">Transactions: {transactions.length}</h2>
      <ul data-testid="transactions">
        {transactions.map((t) => (
          <li key={String(t.id)}>
            {String(t.occurredOn)} · {String(t.direction)} · {String(t.amountMinor)} minor ·{" "}
            {String(t.status)}
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
