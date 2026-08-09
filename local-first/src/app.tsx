import { useState } from "react";
import { LayoutGrid, Plus, Wallet } from "lucide-react";

import { Button } from "@app/components/ui/button";
import { cn } from "@app/lib/utils";

import { evolu, usePlannerData } from "./db";
import { Budgets } from "./screens/budgets";
import { Dashboard } from "./screens/dashboard";
import { QuickAdd } from "./screens/quick-add";
import { NONE } from "./schema";

const PERIOD_MONTH = "2026-08-01";

type Tab = "dashboard" | "add" | "budgets";

const TABS: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "add", label: "Add", icon: Plus },
  { id: "budgets", label: "Budgets", icon: Wallet },
];

export function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const { categories, accounts, transactions, budgets, ready } = usePlannerData();

  /**
   * What a freshly installed app gives you, with nothing to sign up for.
   *
   * On the server version this was a Postgres trigger on user creation. Here
   * there is no user and no server, so it runs on the device the first time
   * there is nothing to show.
   */
  const seed = () => {
    evolu.insert("account", {
      name: "Cash",
      type: "cash",
      openingBalanceMinor: 200000,
      isLiquid: 1,
      isArchived: 0,
    });
    const starters: [string, string, number][] = [
      ["Food & Dining", "#ef4444", 10],
      ["Groceries", "#f97316", 20],
      ["Transport", "#f59e0b", 30],
      ["Housing", "#84cc16", 40],
      ["Utilities", "#22c55e", 50],
      ["Entertainment", "#6366f1", 60],
    ];
    for (const [name, color, sortOrder] of starters) {
      evolu.insert("category", { name, kind: "expense", color, sortOrder, isArchived: 0 });
    }
  };

  const needsSeed = ready && categories.length === 0;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">Smart Planner</span>
          <span className="text-xs text-muted-foreground" data-testid="mode">
            On this device · no account
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-24">
        {needsSeed ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing here yet. Start with a set of categories and a cash account — all stored on
              this device.
            </p>
            <Button className="mt-3" onClick={seed} data-testid="seed">
              Set me up
            </Button>
          </div>
        ) : null}

        {tab === "dashboard" ? (
          <Dashboard
            transactions={transactions}
            categories={categories}
            accounts={accounts}
            budgets={budgets}
            periodMonth={PERIOD_MONTH}
            onRecord={() => setTab("add")}
          />
        ) : null}

        {tab === "add" ? (
          <QuickAdd
            categories={categories}
            accounts={accounts}
            onSaved={() => setTab("dashboard")}
          />
        ) : null}

        {tab === "budgets" ? (
          <Budgets
            budgets={budgets}
            transactions={transactions}
            categories={categories}
            periodMonth={PERIOD_MONTH}
          />
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-surface">
        <div className="mx-auto flex max-w-3xl">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              data-testid={`tab-${id}`}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
                tab === id ? "text-accent" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export { NONE };
