import { useState } from "react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent } from "@app/components/ui/card";
import { Field, Input, Segmented, Select } from "@app/components/ui/field";
import { PageHeader } from "@app/components/ui/page-header";
import type { ExpenseNature, TransactionDirection } from "@app/lib/domain/enums";
import { parseAmount } from "@app/lib/money";

import { evolu, type AccountRow, type CategoryRow } from "../db";
import { NONE } from "../schema";

const TODAY = "2026-08-09";

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
  onSaved,
}: {
  categories: readonly CategoryRow[];
  accounts: readonly AccountRow[];
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState<TransactionDirection>("expense");
  const [nature, setNature] = useState<ExpenseNature>("daily");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);

    const minor = parseAmount(amount);
    if (minor === null || minor <= 0) {
      setError("Enter a valid amount");
      return;
    }

    const result = evolu.insert("transaction", {
      occurredOn: TODAY,
      amountMinor: minor,
      direction,
      incomeType: direction === "income" ? "active" : NONE,
      expenseNature: direction === "expense" ? nature : NONE,
      // A recurring entry is an estimate until confirmed, so it goes in as a
      // draft and stays out of every total. Same rule as the server version.
      status: direction === "expense" && nature === "recurring" ? "draft" : "confirmed",
      categoryId: categoryId || NONE,
      accountId: String(accounts[0]?.id ?? NONE),
      merchant: NONE,
      note: NONE,
      recurringRuleId: NONE,
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

            <Field label="Category" htmlFor="category">
              <Select
                id="category"
                name="categoryId"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={String(category.id)} value={String(category.id)}>
                    {String(category.name)}
                  </option>
                ))}
              </Select>
            </Field>

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
