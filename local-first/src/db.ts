import { useEffect, useState } from "react";

import { Mnemonic, type InferRow } from "@evolu/common";

import { readSyncConfig, writeSyncConfig } from "./sync-config";
import { createLocalDb } from "./schema";

const params = new URLSearchParams(location.search);
const instance = params.get("instance") ?? "planner";

/**
 * Sync is opt-in, so a fresh install has no mnemonic and no relay: the database
 * is local-only and complete. Once the user turns sync on, the stored config
 * supplies the owner and the transport, and the app reloads to open the
 * database under that owner.
 */
export const syncConfig = readSyncConfig();

export const { evolu } = createLocalDb({
  instanceName: `local-${instance}`,
  mnemonic: syncConfig?.mnemonic,
  relayUrl: syncConfig?.relayUrl,
});

/**
 * Adopting somebody else's owner on a device that already has one.
 *
 * A database is created with an owner the first time it is opened, and handing
 * a different `externalAppOwner` to an existing database does not re-key it —
 * the rows stay under the owner they were written with, and the new owner's
 * data never arrives. That is the difference between pairing a fresh device and
 * pairing one that has been used, and only the second case needs this.
 *
 * `restoreAppOwner` is the operation for it: it resets the local database and
 * pulls down everything belonging to the restored owner. It is destructive to
 * whatever was on this device, which is why the screen that triggers it says
 * so. Comparing mnemonics first keeps it to the one case that needs it, so
 * turning sync on with your own existing owner never wipes anything.
 */
if (syncConfig && !syncConfig.adopted) {
  // Marked adopted first. restoreAppOwner reloads the page, and an unmarked
  // config would restore again on the way back up, forever.
  writeSyncConfig({ ...syncConfig, adopted: true });
  void evolu.restoreAppOwner(Mnemonic.orThrow(syncConfig.mnemonic), { reload: true });
}

export const categoriesQuery = evolu.createQuery((db) =>
  db.selectFrom("category").selectAll().where("isDeleted", "is not", 1).orderBy("sortOrder"),
);
export const accountsQuery = evolu.createQuery((db) =>
  db.selectFrom("account").selectAll().where("isDeleted", "is not", 1).orderBy("name"),
);
export const transactionsQuery = evolu.createQuery((db) =>
  db.selectFrom("transaction").selectAll().where("isDeleted", "is not", 1).orderBy("occurredOn", "desc"),
);
export const budgetsQuery = evolu.createQuery((db) =>
  db.selectFrom("budget").selectAll().where("isDeleted", "is not", 1),
);
export const goalsQuery = evolu.createQuery((db) =>
  db.selectFrom("goal").selectAll().where("isDeleted", "is not", 1).orderBy("targetDate"),
);
export const debtsQuery = evolu.createQuery((db) =>
  db.selectFrom("debt").selectAll().where("isDeleted", "is not", 1).orderBy("name"),
);
export const assetsQuery = evolu.createQuery((db) =>
  db.selectFrom("asset").selectAll().where("isDeleted", "is not", 1).orderBy("name"),
);
export const rulesQuery = evolu.createQuery((db) =>
  db.selectFrom("recurringRule").selectAll().where("isDeleted", "is not", 1).orderBy("label"),
);
export const settingsQuery = evolu.createQuery((db) =>
  db.selectFrom("setting").selectAll().where("isDeleted", "is not", 1),
);

/**
 * The row types, inferred from the queries above.
 *
 * `InferRow` takes a Query. Handed a table definition instead it resolves to
 * `never` without complaint, which is what these types were until the workspace
 * was type-checked for the first time.
 */
export type CategoryRow = InferRow<typeof categoriesQuery>;
export type AccountRow = InferRow<typeof accountsQuery>;
export type TransactionRow = InferRow<typeof transactionsQuery>;
export type BudgetRow = InferRow<typeof budgetsQuery>;
export type GoalRow = InferRow<typeof goalsQuery>;
export type DebtRow = InferRow<typeof debtsQuery>;
export type AssetRow = InferRow<typeof assetsQuery>;
export type RecurringRuleRow = InferRow<typeof rulesQuery>;
export type SettingRow = InferRow<typeof settingsQuery>;

/**
 * Everything the screens read, in one subscription.
 *
 * Reloading every query on any change is deliberate: one obviously-correct
 * invalidation beats nine subtly-wrong ones, and measured at six thousand rows
 * a full reload after recording an expense costs under 200 ms. What was not
 * deliberate was doing it nine times over — see the scheduler below.
 */
/** The floor between two reloads. See `schedule` below for why it is wall-clock. */
const MIN_RELOAD_GAP_MS = 250;

export function usePlannerData() {
  const [categories, setCategories] = useState<readonly CategoryRow[]>([]);
  const [accounts, setAccounts] = useState<readonly AccountRow[]>([]);
  const [transactions, setTransactions] = useState<readonly TransactionRow[]>([]);
  const [budgets, setBudgets] = useState<readonly BudgetRow[]>([]);
  const [goals, setGoals] = useState<readonly GoalRow[]>([]);
  const [debts, setDebts] = useState<readonly DebtRow[]>([]);
  const [assets, setAssets] = useState<readonly AssetRow[]>([]);
  const [rules, setRules] = useState<readonly RecurringRuleRow[]>([]);
  const [settings, setSettings] = useState<readonly SettingRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRun = 0;

    /**
     * At most one reload every {@link MIN_RELOAD_GAP_MS}, however many
     * subscriptions fired.
     *
     * Two problems, one fix. There are nine subscriptions and each one calls
     * this, so a single insert scheduled nine identical reloads of all nine
     * queries. And a bulk import writes rows one at a time — Evolu has no batch
     * mutation — so a six thousand row statement produced a storm of
     * notifications, each one re-running a query over the whole six thousand.
     *
     * Measured before this: importing 6,000 rows left the app unusable for
     * about twenty seconds afterwards. The import itself returned in half a
     * second and said "Imported 6000", so nothing looked wrong; the next screen
     * you opened simply hung. Coalescing per tick was not enough, because the
     * notifications arrive across many ticks — the gap has to be wall-clock.
     *
     * Trailing edge, so the last write always lands. A quarter second is below
     * the threshold where a person notices a list updating late, and it turns
     * thousands of full-table queries into a handful.
     */
    const schedule = () => {
      if (disposed || timer) return;
      const wait = Math.max(0, MIN_RELOAD_GAP_MS - (Date.now() - lastRun));
      timer = setTimeout(() => {
        timer = null;
        lastRun = Date.now();
        if (!disposed) load();
      }, wait);
    };

    // Loaded one at a time rather than by mapping over an array of queries:
    // the array's element type is a union of eight different Query types, and
    // Promise.all over it loses which row shape belongs to which setter.
    const load = () => {
      void Promise.all([
        evolu.loadQuery(categoriesQuery),
        evolu.loadQuery(accountsQuery),
        evolu.loadQuery(transactionsQuery),
        evolu.loadQuery(budgetsQuery),
        evolu.loadQuery(goalsQuery),
        evolu.loadQuery(debtsQuery),
        evolu.loadQuery(assetsQuery),
        evolu.loadQuery(rulesQuery),
        evolu.loadQuery(settingsQuery),
      ]).then(([c, a, t, b, g, d, s, r, set]) => {
        if (disposed) return;
        setCategories(c);
        setAccounts(a);
        setTransactions(t);
        setBudgets(b);
        setGoals(g);
        setDebts(d);
        setAssets(s);
        setRules(r);
        setSettings(set);
        setReady(true);
      });
    };

    load();
    const subs = [
      evolu.subscribeQuery(categoriesQuery)(schedule),
      evolu.subscribeQuery(accountsQuery)(schedule),
      evolu.subscribeQuery(transactionsQuery)(schedule),
      evolu.subscribeQuery(budgetsQuery)(schedule),
      evolu.subscribeQuery(goalsQuery)(schedule),
      evolu.subscribeQuery(debtsQuery)(schedule),
      evolu.subscribeQuery(assetsQuery)(schedule),
      evolu.subscribeQuery(rulesQuery)(schedule),
      evolu.subscribeQuery(settingsQuery)(schedule),
    ];
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      subs.forEach((un) => un());
    };
  }, []);

  return { categories, accounts, transactions, budgets, goals, debts, assets, rules, settings, ready };
}
