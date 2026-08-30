import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Landmark,
  LayoutGrid,
  MoreHorizontal,
  PiggyBank,
  Plus,
  RefreshCw,
  Repeat,
  Settings2,
  Upload,
  Download,
  Receipt,
  PieChart,
  Target,
  Wallet,
} from "lucide-react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent } from "@app/components/ui/card";
import { PageHeader } from "@app/components/ui/page-header";
import { cn } from "@app/lib/utils";

import { allCategoriesQuery, evolu, syncConfig, usePlannerData } from "./db";
import { PERIOD_MONTH } from "./today";
import { NONE } from "./schema";
import { MoneyFormatProvider } from "./money-format";
import { Breakdown } from "./screens/breakdown";
import { Budgets } from "./screens/budgets";
import { Dashboard } from "./screens/dashboard";
import { Income } from "./screens/income";
import { QuickAdd } from "./screens/quick-add";
import { Transactions } from "./screens/transactions";
import { Export } from "./screens/export";
import { Import } from "./screens/import";
import { Recurring } from "./screens/recurring";
import { Settings } from "./screens/settings";
import { Sync } from "./screens/sync";
import { Debts, Goals, NetWorth } from "./screens/wealth";




/**
 * The expense categories a new install starts with.
 *
 * Sixteen rather than six, because the first thing anybody does with a
 * six-category planner is discover their spending does not fit it, and a row
 * filed under the wrong heading is worse than one left uncategorised — it is
 * wrong in a way the totals do not show.
 *
 * Colours sweep the hue wheel once so sixteen dots stay tellable apart, with a
 * neutral slate on Miscellaneous — a catch-all should not look like a category
 * with an opinion. None of them collide with the income colours.
 */
export const STARTER_EXPENSES: [string, string, number][] = [
  ["Food", "#ef4444", 10],
  ["Social Life", "#f97316", 20],
  ["Self-Development", "#f59e0b", 30],
  ["Transportation", "#84cc16", 40],
  ["Culture", "#22c55e", 50],
  ["Household", "#10b981", 60],
  ["Apparel", "#14b8a6", 70],
  ["Beauty", "#06b6d4", 80],
  ["Health", "#0284c7", 90],
  ["Education", "#3b82f6", 100],
  ["Gift", "#6366f1", 110],
  ["Electronic", "#8b5cf6", 120],
  ["Tax", "#a855f7", 130],
  ["Lottery", "#d946ef", 140],
  ["Donation/Prayer", "#ec4899", 150],
  ["Miscellaneous", "#64748b", 160],
];

/**
 * Income, split active from passive at the category rather than per entry.
 *
 * Which is which is a property of the income: a dividend is passive every time
 * it arrives. Asking on each entry invites two different answers for the same
 * thing, and the FIRE figure is measured against passive income — so a slip
 * there quietly changes the one number the whole plan turns on.
 *
 * Gross Income carries the CPF flag. It is a flag rather than a match on the
 * name because the name belongs to the user, who may rename it.
 */
export const STARTER_INCOME: [string, string, number, "active" | "passive", 0 | 1][] = [
  ["Gross Income", "#0ea5e9", 1010, "active", 1],
  ["General Income", "#38bdf8", 1020, "active", 0],
  ["Freelance Income", "#22d3ee", 1030, "active", 0],
  ["Commissions and Fees", "#2dd4bf", 1040, "active", 0],
  ["Dividend", "#34d399", 1050, "passive", 0],
  ["Interests", "#4ade80", 1060, "passive", 0],
  ["Royalties", "#a3e635", 1070, "passive", 0],
  ["Capital gains", "#facc15", 1080, "passive", 0],
];

/**
 * Which standard categories this database has never had.
 *
 * Matched on name against **every** category ever created, deleted ones
 * included. Comparing against the visible list would resurrect anything the
 * user had deliberately thrown away, once per launch, forever.
 */
export function missingStarters<T extends readonly [string, ...unknown[]]>(
  starters: readonly T[],
  everCreated: readonly { name: unknown }[],
): T[] {
  const seen = new Set(everCreated.map((row) => String(row.name).trim().toLowerCase()));
  return starters.filter((row) => !seen.has(row[0].toLowerCase()));
}

type Screen =
  | "dashboard"
  | "add"
  | "budgets"
  | "more"
  | "transactions"
  | "breakdown"
  | "income"
  | "goals"
  | "debts"
  | "net-worth"
  | "recurring"
  | "import"
  | "export"
  | "settings"
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
  { id: "breakdown", label: "Where it went", hint: "Spending by category, over any period", icon: PieChart },
  { id: "income", label: "Income", hint: "Active and passive, kept apart", icon: Wallet },
  { id: "recurring", label: "Fixed & recurring", hint: "Commitments that post themselves", icon: Repeat },
  { id: "goals", label: "Goals", hint: "What you are saving for", icon: Target },
  { id: "debts", label: "Debts", hint: "What you owe and when it clears", icon: Landmark },
  { id: "net-worth", label: "Net worth", hint: "Everything owned less everything owed", icon: PiggyBank },
  { id: "import", label: "Import CSV", hint: "A bank export, read on this device", icon: Upload },
  { id: "export", label: "Export", hint: "Take your records to a laptop or a backup", icon: Download },
  { id: "settings", label: "Settings", hint: "Categories and accounts", icon: Settings2 },
  {
    id: "sync",
    label: "Sync",
    hint: syncConfig ? "On — your devices share this data" : "Off — this device only",
    icon: RefreshCw,
  },
];

export function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const { categories, accounts, transactions, budgets, goals, debts, assets, rules, settings, ready } =
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
    const starters = STARTER_EXPENSES;
    for (const [name, color, sortOrder] of starters) {
      evolu.insert("category", {
        name,
        kind: "expense",
        color,
        sortOrder,
        isArchived: 0,
        incomeType: NONE,
        isCpfEligible: 0,
      });
    }

    const income = STARTER_INCOME;
    for (const [name, color, sortOrder, incomeType, isCpfEligible] of income) {
      evolu.insert("category", {
        name,
        kind: "income",
        color,
        sortOrder,
        isArchived: 0,
        incomeType,
        isCpfEligible,
      });
    }
  };

  /**
   * Adding standard categories an existing install never had.
   *
   * Seeding only ran on an empty database, so anybody who had already used the
   * app kept whatever list they started with — the sixteen categories shipped
   * and nobody who already had the app ever saw them. A first install is not
   * the only moment the standard set can change.
   *
   * Deleted categories count as "had", so nothing the user threw away comes
   * back. The ref stops a failed insert from retrying on every render; a
   * successful one removes itself from the missing list anyway.
   */
  const toppedUp = useRef(false);
  useEffect(() => {
    if (!ready || categories.length === 0 || toppedUp.current) return;
    toppedUp.current = true;

    void evolu.loadQuery(allCategoriesQuery).then((everCreated) => {
      for (const [name, color, sortOrder] of missingStarters(STARTER_EXPENSES, everCreated)) {
        evolu.insert("category", {
          name, kind: "expense", color, sortOrder,
          isArchived: 0, incomeType: NONE, isCpfEligible: 0,
        });
      }
      for (const [name, color, sortOrder, incomeType, isCpfEligible] of missingStarters(
        STARTER_INCOME,
        everCreated,
      )) {
        evolu.insert("category", {
          name, kind: "income", color, sortOrder,
          isArchived: 0, incomeType, isCpfEligible,
        });
      }
    });
  }, [ready, categories.length]);

  const needsSeed = ready && categories.length === 0;
  const activeTab: Screen = TABS.some((tab) => tab.id === screen) ? screen : "more";

  return (
    // Everything below reads the currency and locale from here rather than from
    // a constant repeated in nine files.
    <MoneyFormatProvider settings={settings}>
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
            settings={settings}
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

        {screen === "breakdown" ? (
          <Breakdown transactions={transactions} categories={categories} />
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

        {screen === "recurring" ? <Recurring rules={rules} accounts={accounts} /> : null}

        {screen === "import" ? <Import accounts={accounts} transactions={transactions} /> : null}

        {screen === "export" ? (
          <Export transactions={transactions} categories={categories} accounts={accounts} />
        ) : null}

        {screen === "settings" ? (
          <Settings categories={categories} accounts={accounts} transactions={transactions} settings={settings} />
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
    </MoneyFormatProvider>
  );
}