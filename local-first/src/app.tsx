import { useState } from "react";
import {
  ChevronRight,
  Landmark,
  LayoutGrid,
  MoreHorizontal,
  PiggyBank,
  Plus,
  RefreshCw,
  Receipt,
  Target,
  Wallet,
} from "lucide-react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent } from "@app/components/ui/card";
import { PageHeader } from "@app/components/ui/page-header";
import { cn } from "@app/lib/utils";

import { evolu, syncConfig, usePlannerData } from "./db";
import { Budgets } from "./screens/budgets";
import { Dashboard } from "./screens/dashboard";
import { Income } from "./screens/income";
import { QuickAdd } from "./screens/quick-add";
import { Transactions } from "./screens/transactions";
import { Sync } from "./screens/sync";
import { Debts, Goals, NetWorth } from "./screens/wealth";

const PERIOD_MONTH = "2026-08-01";

type Screen =
  | "dashboard"
  | "add"
  | "budgets"
  | "more"
  | "transactions"
  | "income"
  | "goals"
  | "debts"
  | "net-worth"
  | "sync";

/** Four fit across a phone. Everything else lives behind More. */
const TABS: { id: Screen; label: string; icon: typeof LayoutGrid }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "add", label: "Add", icon: Plus },
  { id: "budgets", label: "Budgets", icon: Wallet },
  { id: "more", label: "More", icon: MoreHorizontal },
];

const MORE: { id: Screen; label: string; hint: string; icon: typeof LayoutGrid }[] = [
  { id: "transactions", label: "Transactions", hint: "Everything you have recorded", icon: Receipt },
  { id: "income", label: "Income", hint: "Active and passive, kept apart", icon: Wallet },
  { id: "goals", label: "Goals", hint: "What you are saving for", icon: Target },
  { id: "debts", label: "Debts", hint: "What you owe and when it clears", icon: Landmark },
  { id: "net-worth", label: "Net worth", hint: "Everything owned less everything owed", icon: PiggyBank },
  {
    id: "sync",
    label: "Sync",
    hint: syncConfig ? "On — your devices share this data" : "Off — this device only",
    icon: RefreshCw,
  },
];

export function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const { categories, accounts, transactions, budgets, goals, debts, assets, ready } =
    usePlannerData();

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
  const activeTab: Screen = TABS.some((tab) => tab.id === screen) ? screen : "more";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">Smart Planner</span>
          <span className="text-xs text-muted-foreground" data-testid="mode">
            {syncConfig ? "Synced · end-to-end encrypted" : "On this device · no account"}
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

        {screen === "dashboard" ? (
          <Dashboard
            transactions={transactions}
            categories={categories}
            accounts={accounts}
            budgets={budgets}
            periodMonth={PERIOD_MONTH}
            onRecord={() => setScreen("add")}
          />
        ) : null}

        {screen === "add" ? (
          <QuickAdd
            categories={categories}
            accounts={accounts}
            onSaved={() => setScreen("dashboard")}
          />
        ) : null}

        {screen === "budgets" ? (
          <Budgets
            budgets={budgets}
            transactions={transactions}
            categories={categories}
            periodMonth={PERIOD_MONTH}
          />
        ) : null}

        {screen === "transactions" ? (
          <Transactions transactions={transactions} categories={categories} />
        ) : null}

        {screen === "income" ? (
          <Income transactions={transactions} periodMonth={PERIOD_MONTH} />
        ) : null}

        {screen === "goals" ? <Goals goals={goals} /> : null}

        {screen === "debts" ? <Debts debts={debts} /> : null}

        {screen === "net-worth" ? (
          <NetWorth
            accounts={accounts}
            transactions={transactions}
            assets={assets}
            debts={debts}
          />
        ) : null}

        {screen === "sync" ? <Sync config={syncConfig} /> : null}

        {screen === "more" ? (
          <>
            <PageHeader title="More" description="The rest of the planner." />
            <Card>
              <CardContent className="pt-2">
                <ul className="divide-y divide-border">
                  {MORE.map(({ id, label, hint, icon: Icon }) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => setScreen(id)}
                        data-testid={`more-${id}`}
                        className="flex w-full items-center gap-3 py-3 text-left"
                      >
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{label}</span>
                          <span className="block text-xs text-muted-foreground">{hint}</span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-surface">
        <div className="mx-auto flex max-w-3xl">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setScreen(id)}
              data-testid={`tab-${id}`}
              aria-current={activeTab === id ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
                activeTab === id ? "text-accent" : "text-muted-foreground",
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
