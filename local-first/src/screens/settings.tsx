import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { Field, Input } from "@app/components/ui/field";
import { PageHeader } from "@app/components/ui/page-header";
import { formatMoney, parseAmount } from "@app/lib/money";

import { evolu } from "../db";
import { accountBalances } from "../repository";
import type { AccountRow, CategoryRow, TransactionRow } from "../db";

const CURRENCY = "SGD";
const LOCALE = "en-SG";

/**
 * Categories and accounts: the things everything else is built on.
 *
 * Archiving rather than deleting is the point of the toggle. A deleted category
 * takes its history's meaning with it; an archived one stays off the pickers
 * while every transaction that used it still says what it was.
 */
export function Settings({
  categories,
  accounts,
  transactions,
}: {
  categories: readonly CategoryRow[];
  accounts: readonly AccountRow[];
  transactions: readonly TransactionRow[];
}) {
  const [categoryName, setCategoryName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState<string | null>(null);

  const money = (minor: number) => formatMoney(minor, CURRENCY, LOCALE);
  const balances = accountBalances(accounts, transactions);

  const addCategory = (event: React.FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return setError("Give the category a name");
    const result = evolu.insert("category", {
      name: categoryName.trim(),
      kind: "expense",
      color: "#64748b",
      sortOrder: (categories.length + 1) * 10,
      isArchived: 0,
    });
    if (!result.ok) return setError(JSON.stringify(result.error));
    setError(null);
    setCategoryName("");
  };

  const addAccount = (event: React.FormEvent) => {
    event.preventDefault();
    const minor = parseAmount(opening || "0");
    if (!accountName.trim() || minor === null) return setError("Give the account a name");
    const result = evolu.insert("account", {
      name: accountName.trim(),
      type: "bank",
      openingBalanceMinor: minor,
      isLiquid: 1,
      isArchived: 0,
    });
    if (!result.ok) return setError(JSON.stringify(result.error));
    setError(null);
    setAccountName("");
    setOpening("");
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="The categories and accounts everything else is built on."
      />

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Archiving keeps a category off your pickers while leaving past transactions labelled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-border" data-testid="category-list">
            {categories.map((category) => {
              const archived = Number(category.isArchived) === 1;
              return (
                <li key={String(category.id)} className="flex items-center gap-3 py-2.5">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: String(category.color) }}
                    aria-hidden
                  />
                  <span className={archived ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm"}>
                    {String(category.name)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="toggle-archive"
                    onClick={() =>
                      evolu.update("category", { id: category.id, isArchived: archived ? 0 : 1 })
                    }
                  >
                    {archived ? "Restore" : "Archive"}
                  </Button>
                </li>
              );
            })}
          </ul>

          <form onSubmit={addCategory} className="flex items-end gap-3">
            <Field label="New category" htmlFor="category-name" error={error ?? undefined} className="flex-1">
              <Input
                id="category-name"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="e.g. Childcare"
              />
            </Field>
            <Button type="submit" data-testid="add-category">
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Balances are the opening figure plus everything confirmed since.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-border" data-testid="account-list">
            {accounts.map((account) => (
              <li key={String(account.id)} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{String(account.name)}</p>
                  <p className="text-xs text-muted-foreground">
                    opened at {money(Number(account.openingBalanceMinor))}
                  </p>
                </div>
                <span className="tabular text-sm font-medium" data-testid="account-balance">
                  {money(balances.get(String(account.id)) ?? 0)}
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${String(account.name)}`}
                  onClick={() => evolu.update("account", { id: account.id, isDeleted: 1 })}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-rose-600"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={addAccount} className="grid gap-3 sm:grid-cols-3">
            <Field label="New account" htmlFor="account-name">
              <Input
                id="account-name"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="e.g. Savings"
              />
            </Field>
            <Field label="Opening balance" htmlFor="account-opening">
              <Input
                id="account-opening"
                inputMode="decimal"
                className="tabular"
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
                placeholder="0.00"
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" data-testid="add-account">
                Add account
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
