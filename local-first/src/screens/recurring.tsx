import { useState } from "react";
import { RefreshCw, Repeat } from "lucide-react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { EmptyState } from "@app/components/ui/empty-state";
import { Field, Input, Segmented } from "@app/components/ui/field";
import { PageHeader } from "@app/components/ui/page-header";
import type { ExpenseNature } from "@app/lib/domain/enums";
import { planMaterialization, type MaterializableRule } from "@app/lib/domain/materialize";
import { describeRecurrence } from "@app/lib/domain/recurring";
import { formatMoney, parseAmount } from "@app/lib/money";

import { evolu } from "../db";
import { NONE, type AccountRow, type RecurringRuleRow } from "../schema";

const CURRENCY = "SGD";
const LOCALE = "en-SG";
const TODAY = "2026-08-09";

/**
 * Fixed and recurring, kept in separate buckets.
 *
 * The distinction the whole brief turns on: a fixed rule is the same amount
 * every period and posts itself as confirmed; a recurring one repeats but
 * varies, so it posts a draft from the estimate and stays out of every total
 * until you say what it really was.
 *
 * Both the planning and the date arithmetic are the shipped modules'
 * (`planMaterialization`, `describeRecurrence`), including the month-end rule
 * where the 31st becomes the 28th in February and returns to the 31st
 * afterwards rather than drifting earlier for ever.
 */
export function Recurring({
  rules,
  accounts,
}: {
  rules: readonly RecurringRuleRow[];
  accounts: readonly AccountRow[];
}) {
  const [kind, setKind] = useState<Extract<ExpenseNature, "fixed" | "recurring">>("fixed");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("2026-06-01");
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);

  const money = (minor: number) => formatMoney(minor, CURRENCY, LOCALE);

  const toDomain = (row: RecurringRuleRow): MaterializableRule => ({
    id: String(row.id),
    // No users here; the field exists because the shipped type has it.
    userId: "local",
    label: String(row.label),
    direction: String(row.direction) as MaterializableRule["direction"],
    incomeType: null,
    expenseNature: String(row.expenseNature) as ExpenseNature,
    categoryId: String(row.categoryId) === NONE ? null : String(row.categoryId),
    accountId: String(row.accountId) === NONE ? null : String(row.accountId),
    amount: Number(row.amountMinor) || null,
    estimatedAmount: Number(row.estimatedAmountMinor) || null,
    frequency: String(row.frequency) as MaterializableRule["frequency"],
    intervalCount: Number(row.intervalCount) || 1,
    dayOfMonth: Number(row.dayOfMonth) || null,
    startDate: String(row.startDate),
    endDate: String(row.endDate) === NONE ? null : String(row.endDate),
    isActive: Number(row.isActive) === 1,
    lastMaterializedOn:
      String(row.lastMaterializedOn) === NONE ? null : String(row.lastMaterializedOn),
  });

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const minor = parseAmount(amount);
    if (!label.trim() || minor === null || minor <= 0) {
      setError("A name and an amount above zero");
      return;
    }
    const isFixed = kind === "fixed";
    const result = evolu.insert("recurringRule", {
      label: label.trim(),
      direction: "expense",
      expenseNature: kind,
      incomeType: NONE,
      categoryId: NONE,
      accountId: String(accounts[0]?.id ?? NONE),
      frequency: "monthly",
      intervalCount: 1,
      dayOfMonth: 1,
      startDate,
      endDate: NONE,
      // A fixed rule carries a real amount; a variable one carries an estimate.
      // Storing both in one column would lose exactly the distinction the two
      // buckets exist to keep.
      amountMinor: isFixed ? minor : 0,
      estimatedAmountMinor: isFixed ? 0 : minor,
      lastMaterializedOn: NONE,
      isActive: 1,
    });
    if (!result.ok) return setError(JSON.stringify(result.error));
    setError(null);
    setLabel("");
    setAmount("");
  };

  /** Posts everything due, exactly as the cron route does on the server. */
  const postDue = () => {
    let count = 0;
    for (const row of rules) {
      if (Number(row.isActive) !== 1) continue;
      const plan = planMaterialization(toDomain(row), TODAY);
      for (const planned of plan.transactions) {
        const inserted = evolu.insert("transaction", {
          occurredOn: planned.occurredOn,
          amountMinor: planned.amount,
          direction: planned.direction,
          incomeType: planned.incomeType ?? NONE,
          expenseNature: planned.expenseNature ?? NONE,
          status: planned.status,
          categoryId: planned.categoryId ?? NONE,
          accountId: planned.accountId ?? NONE,
          merchant: NONE,
          note: planned.note || NONE,
          recurringRuleId: planned.ruleId,
        });
        if (inserted.ok) count += 1;
      }
      if (plan.lastMaterializedOn) {
        evolu.update("recurringRule", { id: row.id, lastMaterializedOn: plan.lastMaterializedOn });
      }
    }
    setPosted(count === 0 ? "Nothing was due." : `Posted ${count}.`);
  };

  return (
    <>
      <PageHeader
        title="Fixed & recurring"
        description="Monthly commitments, split into predictable and variable."
        actions={
          rules.length > 0 ? (
            <Button variant="outline" size="sm" onClick={postDue} data-testid="post-due">
              <RefreshCw aria-hidden />
              Post what is due
            </Button>
          ) : undefined
        }
      />

      {posted ? (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400" data-testid="posted">
          {posted}
        </p>
      ) : null}

      {rules.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No rules yet"
          description="Add your rent or your utilities once and they post themselves from then on."
        />
      ) : (
        <Card>
          <CardContent className="pt-2">
            <ul className="divide-y divide-border" data-testid="rule-list">
              {rules.map((row) => {
                const isFixed = String(row.expenseNature) === "fixed";
                const figure = isFixed ? Number(row.amountMinor) : Number(row.estimatedAmountMinor);
                return (
                  <li key={String(row.id)} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{String(row.label)}</p>
                      <p className="text-xs text-muted-foreground">
                        {describeRecurrence({
                          frequency: String(row.frequency) as MaterializableRule["frequency"],
                          intervalCount: Number(row.intervalCount) || 1,
                          dayOfMonth: Number(row.dayOfMonth) || null,
                          startDate: String(row.startDate),
                        })}
                      </p>
                    </div>
                    <span
                      className={
                        isFixed
                          ? "rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-600 ring-1 ring-inset ring-sky-500/20 dark:text-sky-400"
                          : "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400"
                      }
                      data-testid={`kind-${isFixed ? "fixed" : "recurring"}`}
                    >
                      {isFixed ? "Fixed" : "Estimate"}
                    </span>
                    <span className="tabular shrink-0 text-sm font-medium">{money(figure)}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a rule</CardTitle>
          <CardDescription>
            Fixed posts itself and counts straight away. Recurring posts a draft from the estimate,
            excluded from your totals until you confirm the real figure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-3">
            <Segmented
              name="kind"
              value={kind}
              onChange={setKind}
              options={[
                { value: "fixed", label: "Fixed", description: "Same amount every period" },
                { value: "recurring", label: "Recurring", description: "Repeats but varies" },
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name" htmlFor="rule-label" error={error ?? undefined}>
                <Input id="rule-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Rent" />
              </Field>
              <Field label={kind === "fixed" ? "Amount" : "Usual amount"} htmlFor="rule-amount">
                <Input id="rule-amount" inputMode="decimal" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Starts" htmlFor="rule-start">
                <Input id="rule-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
            </div>
            <Button type="submit" data-testid="add-rule">
              Add rule
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
