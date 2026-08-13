import { useState } from "react";
import { Landmark, PiggyBank, Target } from "lucide-react";

import { StatTile } from "@app/components/dashboard/stat-tile";
import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { EmptyState } from "@app/components/ui/empty-state";
import { Field, Input } from "@app/components/ui/field";
import { PageHeader } from "@app/components/ui/page-header";
import { ProgressBar } from "@app/components/ui/progress-bar";
import { projectPayoff, payoffDate, summariseDebts } from "@app/lib/domain/debt";
import { goalProgress } from "@app/lib/domain/goals";
import { computeNetWorth } from "@app/lib/domain/net-worth";
import { formatMoney, parseAmount } from "@app/lib/money";

import { evolu } from "../db";
import { useMoneyFormat } from "../money-format";
import { accountBalances } from "../repository";
import { TODAY } from "../today";
import type { AccountRow, AssetRow, DebtRow, GoalRow, TransactionRow } from "../db";


/** Goals, with the one number that matters: what to set aside each month. */
export function Goals({ goals }: { goals: readonly GoalRow[] }) {
  const { money, locale } = useMoneyFormat();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("2027-06-30");
  const [error, setError] = useState<string | null>(null);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const minor = parseAmount(target);
    if (!name.trim() || minor === null || minor <= 0) {
      setError("A name and a target above zero");
      return;
    }
    const result = evolu.insert("goal", {
      name: name.trim(),
      targetMinor: minor,
      currentMinor: 0,
      targetDate: date,
      isCompleted: 0,
    });
    if (!result.ok) return setError(JSON.stringify(result.error));
    setError(null);
    setName("");
    setTarget("");
  };

  return (
    <>
      <PageHeader title="Goals" description="What you are saving for, and whether you are on track." />

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Give one a target and a date and this page works out what to set aside each month."
        />
      ) : (
        <Card>
          <CardContent className="pt-2">
            <ul className="divide-y divide-border" data-testid="goal-list">
              {goals.map((goal) => {
                // The whole calculation is the shipped module's.
                const progress = goalProgress(
                  {
                    targetAmount: Number(goal.targetMinor),
                    currentAmount: Number(goal.currentMinor),
                    targetDate: String(goal.targetDate),
                    isCompleted: Number(goal.isCompleted) === 1,
                  },
                  TODAY,
                );
                return (
                  <li key={String(goal.id)} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{String(goal.name)}</span>
                      <span className="tabular text-sm">
                        {money(Number(goal.currentMinor))} of {money(Number(goal.targetMinor))}
                      </span>
                    </div>
                    <ProgressBar value={progress.ratio * 100} className="mt-1.5" />
                    <p className="mt-1 text-xs text-muted-foreground" data-testid="goal-monthly">
                      {progress.requiredMonthly === null
                        ? "No target date, so no monthly figure."
                        : `Set aside ${money(progress.requiredMonthly)} a month to arrive on time.`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a goal</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" htmlFor="goal-name" error={error ?? undefined}>
              <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Japan trip" />
            </Field>
            <Field label="Target" htmlFor="goal-target">
              <Input id="goal-target" inputMode="decimal" className="tabular" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="By" htmlFor="goal-date">
              <Input id="goal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" data-testid="add-goal">
                Add goal
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

/** Debts, with the payoff simulated rather than solved by formula. */
export function Debts({ debts }: { debts: readonly DebtRow[] }) {
  const { money, locale } = useMoneyFormat();
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("6.5");
  const [payment, setPayment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = debts.filter((debt) => Number(debt.isClosed) !== 1);
  const summary = summariseDebts(
    open.map((debt) => ({
      remainingBalance: Number(debt.remainingMinor),
      minimumPayment: Number(debt.minimumPaymentMinor),
      // Stored as basis points so the rate is an integer too; the domain module
      // wants a percentage.
      apr: Number(debt.aprBps) / 100,
    })),
  );

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const owed = parseAmount(balance);
    const pay = parseAmount(payment);
    if (!name.trim() || owed === null || owed <= 0 || pay === null) {
      setError("A name, a balance and a monthly payment");
      return;
    }
    const result = evolu.insert("debt", {
      name: name.trim(),
      principalMinor: owed,
      remainingMinor: owed,
      aprBps: Math.round(Number(apr) * 100),
      minimumPaymentMinor: pay,
      isClosed: 0,
    });
    if (!result.ok) return setError(JSON.stringify(result.error));
    setError(null);
    setName("");
    setBalance("");
    setPayment("");
  };

  return (
    <>
      <PageHeader title="Debts" description="What you owe, what it costs, and when it goes away." />

      {open.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No debts recorded"
          description="Add a loan or a card and this page projects when it clears and what the interest costs you."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile label="Total owed" value={money(summary.totalOwed)} hero />
            <StatTile
              label="Average rate"
              value={`${summary.averageApr.toFixed(2)}%`}
              hint={`Weighted by balance · ${money(summary.totalMinimumPayment)} a month`}
            />
          </div>

          <Card>
            <CardContent className="pt-2">
              <ul className="divide-y divide-border" data-testid="debt-list">
                {open.map((debt) => {
                  const result = projectPayoff({
                    balance: Number(debt.remainingMinor),
                    apr: Number(debt.aprBps) / 100,
                    monthlyPayment: Number(debt.minimumPaymentMinor),
                  });
                  return (
                    <li key={String(debt.id)} className="py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{String(debt.name)}</span>
                        <span className="tabular text-sm">{money(Number(debt.remainingMinor))}</span>
                      </div>
                      {result.paysOff ? (
                        <p className="mt-1 text-xs text-muted-foreground" data-testid="payoff">
                          Clear by {payoffDate(TODAY, result.months)} · {result.months} months ·{" "}
                          {money(result.totalInterest)} interest
                        </p>
                      ) : (
                        // Projecting a hundred years would be technically true
                        // and useless. Say what is actually wrong.
                        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400" data-testid="underwater">
                          This payment never clears it — interest alone is{" "}
                          {money(result.monthlyInterest)} a month. Pay at least{" "}
                          {money(result.minimumViablePayment)} to start reducing the balance.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a debt</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-4">
            <Field label="Name" htmlFor="debt-name" error={error ?? undefined}>
              <Input id="debt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Car loan" />
            </Field>
            <Field label="Owed" htmlFor="debt-balance">
              <Input id="debt-balance" inputMode="decimal" className="tabular" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Rate %" htmlFor="debt-apr">
              <Input id="debt-apr" inputMode="decimal" className="tabular" value={apr} onChange={(e) => setApr(e.target.value)} />
            </Field>
            <Field label="Monthly" htmlFor="debt-payment">
              <Input id="debt-payment" inputMode="decimal" className="tabular" value={payment} onChange={(e) => setPayment(e.target.value)} placeholder="0.00" />
            </Field>
            <div className="sm:col-span-4">
              <Button type="submit" data-testid="add-debt">
                Add debt
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

/** Net worth: account balances counted automatically, assets added by hand. */
export function NetWorth({
  accounts,
  transactions,
  assets,
  debts,
}: {
  accounts: readonly AccountRow[];
  transactions: readonly TransactionRow[];
  assets: readonly AssetRow[];
  debts: readonly DebtRow[];
}) {
  const { money, locale } = useMoneyFormat();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const balances = accountBalances(accounts, transactions);
  const breakdown = computeNetWorth({
    accountBalances: [...balances.values()],
    assetValues: assets.map((asset) => Number(asset.valueMinor)),
    debtBalances: debts
      .filter((debt) => Number(debt.isClosed) !== 1)
      .map((debt) => Number(debt.remainingMinor)),
  });

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const minor = parseAmount(value);
    if (!name.trim() || minor === null || minor <= 0) {
      setError("A name and a value above zero");
      return;
    }
    const result = evolu.insert("asset", {
      name: name.trim(),
      type: "property",
      valueMinor: minor,
      asOf: TODAY,
    });
    if (!result.ok) return setError(JSON.stringify(result.error));
    setError(null);
    setName("");
    setValue("");
  };

  return (
    <>
      <PageHeader title="Net worth" description="Everything you own, less everything you owe." />

      {accounts.length === 0 && assets.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="Nothing to add up yet"
          description="Your account balances count automatically. Add anything held outside them below."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Net worth" value={money(breakdown.netWorth)} hero />
          <StatTile
            label="Assets"
            value={money(breakdown.totalAssets)}
            hint={`${money(breakdown.cashAndAccounts)} in accounts · ${money(breakdown.otherAssets)} elsewhere`}
          />
          <StatTile label="Liabilities" value={money(breakdown.totalLiabilities)} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add an asset</CardTitle>
          <CardDescription>
            Something you own that does not flow through one of your accounts. Account balances are
            already counted — adding one here would count it twice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" htmlFor="asset-name" error={error ?? undefined}>
              <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Flat" />
            </Field>
            <Field label="Value" htmlFor="asset-value">
              <Input id="asset-value" inputMode="decimal" className="tabular" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" data-testid="add-asset">
                Add asset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
