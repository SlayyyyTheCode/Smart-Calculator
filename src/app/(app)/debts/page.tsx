import type { Metadata } from "next";
import { Landmark, Trash2 } from "lucide-react";

import { StatTile } from "@/components/dashboard/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EntityField, EntityForm } from "@/components/wealth/entity-form";
import { deleteDebt, saveDebt } from "@/lib/actions/wealth";
import { currencySymbol } from "@/lib/currency";
import { listAccounts } from "@/lib/data/accounts";
import { getFormatting } from "@/lib/data/profile";
import { listDebts } from "@/lib/data/wealth";
import { formatMonthLabel, startOfMonth, todayIso } from "@/lib/date";
import { extraPaymentSaving, payoffDate, projectPayoff, summariseDebts } from "@/lib/domain/debt";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Debts" };

/** A round extra payment to illustrate the saving with. */
const EXTRA_PAYMENT = 10_000;

export default async function DebtsPage() {
  const [formatting, debts, accounts] = await Promise.all([
    getFormatting(),
    listDebts(),
    listAccounts(),
  ]);

  const today = todayIso(formatting.timezone);
  const thisMonth = startOfMonth(today);
  const symbol = currencySymbol(formatting.currency, formatting.locale);
  const money = (minor: number) => formatMoney(minor, formatting.currency, formatting.locale);

  const open = debts.filter((debt) => !debt.isClosed);
  const summary = summariseDebts(open);

  return (
    <>
      <PageHeader
        title="Debts"
        description="What you owe, what it costs, and when it goes away."
      />

      {open.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Total owed" value={money(summary.totalOwed)} />
          <StatTile
            label="Minimum payments"
            value={money(summary.totalMinimumPayment)}
            hint="Every month, across all of them."
          />
          <StatTile
            label="Average rate"
            value={`${summary.averageApr.toFixed(1)}%`}
            hint="Weighted by balance, not by how many debts you have."
          />
        </div>
      ) : null}

      {debts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No debts recorded"
          description="Add a loan or a card below and this page projects when it clears and what the interest costs you."
        />
      ) : (
        <ul className="space-y-3">
          {debts.map((debt) => {
            const projection = projectPayoff({
              balance: debt.remainingBalance,
              apr: debt.apr,
              monthlyPayment: debt.minimumPayment,
            });
            const saving = extraPaymentSaving(
              {
                balance: debt.remainingBalance,
                apr: debt.apr,
                monthlyPayment: debt.minimumPayment,
              },
              EXTRA_PAYMENT,
            );
            const paidOff = debt.principal - debt.remainingBalance;

            return (
              <li key={debt.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{debt.name}</span>
                    <Badge>{debt.apr.toFixed(2)}% APR</Badge>
                    {debt.isClosed ? <Badge tone="positive">Cleared</Badge> : null}
                  </div>
                  <span className="tabular text-sm">
                    <span className="font-semibold">{money(debt.remainingBalance)}</span>
                    <span className="text-muted-foreground"> of {money(debt.principal)}</span>
                  </span>
                </div>

                <ProgressBar
                  value={debt.principal > 0 ? (paidOff / debt.principal) * 100 : 0}
                  barClassName="bg-emerald-500"
                  label={`${debt.name} paid off`}
                />

                <div className="pt-2 text-xs text-muted-foreground">
                  {debt.isClosed ? (
                    <p>Nothing left to pay.</p>
                  ) : projection.paysOff ? (
                    <>
                      <p>
                        Paying {money(debt.minimumPayment)} a month clears it in{" "}
                        <span className="font-medium text-foreground">
                          {projection.months} {projection.months === 1 ? "month" : "months"}
                        </span>
                        , around{" "}
                        {formatMonthLabel(
                          payoffDate(thisMonth, projection.months),
                          formatting.locale,
                        )}
                        , costing {money(projection.totalInterest)} in interest.
                      </p>
                      {saving && saving.monthsSaved > 0 ? (
                        <p className="pt-0.5">
                          Paying {money(EXTRA_PAYMENT)} more each month would clear it{" "}
                          {saving.monthsSaved}{" "}
                          {saving.monthsSaved === 1 ? "month" : "months"} sooner and save{" "}
                          {money(saving.interestSaved)}.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-rose-600 dark:text-rose-400">
                      {money(debt.minimumPayment)} a month does not cover the{" "}
                      {money(projection.monthlyInterest)} of interest this accrues, so the
                      balance never falls. It needs at least{" "}
                      {money(projection.minimumViablePayment)} to start reducing.
                    </p>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <form action={deleteDebt}>
                    <input type="hidden" name="id" value={debt.id} />
                    <button
                      type="submit"
                      aria-label={`Delete ${debt.name}`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-rose-600"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a debt</CardTitle>
          <CardDescription>
            The rate and the monthly payment are what drive the projection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntityForm action={saveDebt} submitLabel="Add debt">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <EntityField name="name" label="Name" htmlFor="debt-name">
                <Input id="debt-name" name="name" required placeholder="e.g. Car loan" />
              </EntityField>

              <EntityField name="principal" label="Amount borrowed" htmlFor="debt-principal">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    id="debt-principal"
                    name="principal"
                    inputMode="decimal"
                    required
                    placeholder="0.00"
                    className="pl-9 tabular"
                  />
                </div>
              </EntityField>

              <EntityField
                name="remainingBalance"
                label="Still owed"
                htmlFor="debt-remaining"
                hint="Leave blank if you have not paid any of it yet."
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    id="debt-remaining"
                    name="remainingBalance"
                    inputMode="decimal"
                    placeholder="Same as borrowed"
                    className="pl-9 tabular"
                  />
                </div>
              </EntityField>

              <EntityField name="apr" label="Interest rate" htmlFor="debt-apr">
                <div className="relative">
                  <Input
                    id="debt-apr"
                    name="apr"
                    type="number"
                    step="0.01"
                    min={0}
                    max={200}
                    defaultValue="0"
                    className="tabular pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    %
                  </span>
                </div>
              </EntityField>

              <EntityField name="minimumPayment" label="Monthly payment" htmlFor="debt-payment">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    id="debt-payment"
                    name="minimumPayment"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="pl-9 tabular"
                  />
                </div>
              </EntityField>

              <EntityField name="startDate" label="Started" htmlFor="debt-start">
                <Input id="debt-start" name="startDate" type="date" required defaultValue={today} />
              </EntityField>

              <EntityField name="accountId" label="Account" htmlFor="debt-account">
                <Select id="debt-account" name="accountId" defaultValue="">
                  <option value="">Not specified</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </EntityField>
            </div>
          </EntityForm>
        </CardContent>
      </Card>
    </>
  );
}
