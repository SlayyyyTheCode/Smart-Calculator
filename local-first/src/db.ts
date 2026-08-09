import { useEffect, useState } from "react";

import { createLocalDb, type AccountRow, type BudgetRow, type CategoryRow, type TransactionRow } from "./schema";

const params = new URLSearchParams(location.search);
const instance = params.get("instance") ?? "planner";

/** No mnemonic and no relay: local-only, which is what a fresh install is. */
export const { evolu } = createLocalDb({ instanceName: `local-${instance}` });

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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => {
      void Promise.all([
        evolu.loadQuery(categoriesQuery),
        evolu.loadQuery(accountsQuery),
        evolu.loadQuery(transactionsQuery),
        evolu.loadQuery(budgetsQuery),
      ]).then(([c, a, t, b]) => {
        setCategories(c as CategoryRow[]);
        setAccounts(a as AccountRow[]);
        setTransactions(t as TransactionRow[]);
        setBudgets(b as BudgetRow[]);
        setReady(true);
      });
    };
    load();
    const subs = [
      evolu.subscribeQuery(categoriesQuery)(load),
      evolu.subscribeQuery(accountsQuery)(load),
      evolu.subscribeQuery(transactionsQuery)(load),
      evolu.subscribeQuery(budgetsQuery)(load),
    ];
    return () => subs.forEach((un) => un());
  }, []);

  return { categories, accounts, transactions, budgets, ready };
}
