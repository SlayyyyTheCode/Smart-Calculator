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
 * Reloading all four on any change is deliberate at this size: the whole
 * database is a few hundred rows on a phone, and one obviously-correct
 * invalidation beats four subtly-wrong ones. It is the kind of thing to make
 * cleverer when a profile says to, not before.
 */
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
      evolu.subscribeQuery(categoriesQuery)(load),
      evolu.subscribeQuery(accountsQuery)(load),
      evolu.subscribeQuery(transactionsQuery)(load),
      evolu.subscribeQuery(budgetsQuery)(load),
      evolu.subscribeQuery(goalsQuery)(load),
      evolu.subscribeQuery(debtsQuery)(load),
      evolu.subscribeQuery(assetsQuery)(load),
      evolu.subscribeQuery(rulesQuery)(load),
      evolu.subscribeQuery(settingsQuery)(load),
    ];
    return () => subs.forEach((un) => un());
  }, []);

  return { categories, accounts, transactions, budgets, goals, debts, assets, rules, settings, ready };
}
