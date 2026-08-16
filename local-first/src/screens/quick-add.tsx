import { useState } from "react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent } from "@app/components/ui/card";
import { Field, Input, Segmented, Select } from "@app/components/ui/field";
import { PageHeader } from "@app/components/ui/page-header";
import { ageOn, cpfContribution, type CpfResidency } from "@app/lib/domain/cpf";
import type { ExpenseNature, TransactionDirection } from "@app/lib/domain/enums";
import { parseAmount } from "@app/lib/money";

import { evolu, type AccountRow, type CategoryRow, type SettingRow } from "../db";
import { useMoneyFormat } from "../money-format";
import { NONE } from "../schema";
import { TODAY } from "../today";

/**
 * Quick add, on the device.
 *
 * `parseAmount` is the shipped parser, so "1,234.5" and "12.34" mean here what
 * they mean in the web app, and the value stored is integer minor units. The
 * amount never becomes a float on its way in — the bug that turned $77.77 into
 * $7,777.00 in the cloud version came from exactly that kind of second
 * conversion.
 */
export function QuickAdd({
  categories,
  accounts,
  settings,
  onSaved,
}: {
  categories: readonly CategoryRow[];
  accounts: readonly AccountRow[];
  settings: readonly SettingRow[];
  onSaved: () => void;
}) {
  const { money } = useMoneyFormat();
  const [direction, setDirection] = useState<TransactionDirection>("expense");
  const [nature, setNature] = useState<ExpenseNature>("daily");
  const [amount, setAmount] = useState("");
  // Defaults to today, because that is what you are usually recording — but the
  // receipt in your pocket is from yesterday often enough that a form which
  // cannot say so is a form you have to work around.
  const [occurredOn, setOccurredOn] = useState(TODAY);
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /**
   * The picker only offers categories that belong to this direction.
   *
   * Showing Groceries under Income is not merely untidy: an income row filed to
   * an expense category lands in the category breakdown, which is a chart of
   * where money went.
   */
  const wanted = direction === "income" ? "income" : "expense";
  const available = categories.filter(
    (row) => String(row.kind) === wanted && Number(row.isArchived) !== 1,
  );
  const chosen = available.find((row) => String(row.id) === categoryId);

  const setting = settings[0];
  const birthDate = String(setting?.birthDate ?? NONE);
  const residency = String(setting?.cpfResidency ?? NONE) as CpfResidency | typeof NONE;
  const cpfApplies =
    direction === "income" &&
    Number(chosen?.isCpfEligible) === 1 &&
    residency !== NONE &&
    birthDate !== NONE;

  const minorNow = parseAmount(amount);
  /**
   * Worked out as you type, so the deduction is visible before you commit to it
   * rather than explained afterwards on the dashboard.
   */
  const cpf =
    cpfApplies && minorNow !== null && minorNow > 0
      ? cpfContribution({
          grossMonthly: minorNow,
          age: ageOn(birthDate, occurredOn),
          residency: residency as CpfResidency,
        })
      : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);

    const minor = parseAmount(amount);
    if (minor === null || minor <= 0) {
      setError("Enter a valid amount");
      return;
    }

    const result = evolu.insert("transaction", {
      occurredOn,
      amountMinor: minor,
      direction,
      // Taken from the category, which is where active-versus-passive is
      // decided once rather than re-answered on every entry.
      incomeType:
        direction === "income" ? String(chosen?.incomeType ?? "active") : NONE,
      expenseNature: direction === "expense" ? nature : NONE,
      // A recurring entry is an estimate until confirmed, so it goes in as a
      // draft and stays out of every total. Same rule as the server version.
      status: direction === "expense" && nature === "recurring" ? "draft" : "confirmed",
      categoryId: categoryId || NONE,
      accountId: String(accounts[0]?.id ?? NONE),
      merchant: NONE,
      note: NONE,
      recurringRuleId: NONE,
      // The contribution as it stood on the day, not as it would be recomputed
      // later under a different age band.
      cpfMinor: cpf?.employeeContribution ?? 0,
    });

    if (!result.ok) {
      setError(JSON.stringify(result.error));
      return;
    }
    setError(null);
    setAmount("");
    setSaved(true);
    onSaved();
  };

  return (
    <>
      <PageHeader title="Quick add" description="Record it now, sort out the detail later." />
      <Card>
        <CardContent className="space-y-4 pt-5">
          <form onSubmit={submit} className="space-y-4">
            <Segmented
              name="direction"
              value={direction}
              onChange={setDirection}
              options={[
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
              ]}
            />

            <Field label="Amount" htmlFor="amount" error={error ?? undefined}>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                required
                placeholder="0.00"
                className="tabular"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>

            {direction === "expense" ? (
              <Field label="Type of expense" htmlFor="nature">
                <Segmented
                  name="nature"
                  value={nature}
                  onChange={setNature}
                  options={[
                    { value: "daily", label: "Daily", description: "Ad-hoc, day-to-day spending" },
                    { value: "fixed", label: "Fixed", description: "Same amount every period" },
                    {
                      value: "recurring",
                      label: "Recurring",
                      description: "Repeats but varies — saved as a draft to confirm later",
                    },
                  ]}
                />
              </Field>
            ) : null}

            <Field label="Date" htmlFor="occurred-on">
              <Input
                id="occurred-on"
                name="occurredOn"
                type="date"
                value={occurredOn}
                onChange={(event) => setOccurredOn(event.target.value)}
              />
            </Field>

            <Field label="Category" htmlFor="category">
              <Select
                id="category"
                name="categoryId"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Uncategorised</option>
                {available.map((category) => (
                  <option key={String(category.id)} value={String(category.id)}>
                    {String(category.name)}
                  </option>
                ))}
              </Select>
            </Field>

            {direction === "income" && chosen ? (
              <p className="text-xs text-muted-foreground" data-testid="income-type">
                Counted as {String(chosen.incomeType)} income
                {String(chosen.incomeType) === "passive"
                  ? " — this is what your FIRE coverage is measured against."
                  : "."}
              </p>
            ) : null}

            {cpf ? (
              <div
                className="rounded-lg border border-border bg-surface-muted p-3 text-sm"
                data-testid="cpf-breakdown"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">CPF (your share)</span>
                  <span className="tabular font-medium" data-testid="cpf-amount">
                    −{money(cpf.employeeContribution)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="font-medium">Take home</span>
                  <span className="tabular font-semibold" data-testid="cpf-take-home">
                    {money(cpf.takeHome)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Age band {cpf.band}.
                  {cpf.cappedByCeiling
                    ? " Above the $8,000 Ordinary Wage ceiling, so the contribution stops there."
                    : ""}{" "}
                  The employer&rsquo;s share goes to CPF too, but it was never part of this figure,
                  so it is not deducted from it.
                </p>
              </div>
            ) : null}

            {direction === "income" && Number(chosen?.isCpfEligible) === 1 && !cpf ? (
              <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="cpf-unset">
                Set your date of birth and residency in Settings and this will work out CPF and
                your take-home pay.
              </p>
            ) : null}

            <Button type="submit" className="w-full" data-testid="record">
              Record it
            </Button>

            {saved ? (
              <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
                Saved on this device.
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </>
  );
}
