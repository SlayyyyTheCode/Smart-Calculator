"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/field";
import type { ActionState } from "@/lib/actions/result";
import { IDLE } from "@/lib/actions/result";
import type { AccountOption } from "@/lib/data/accounts";
import type { CategoryOption } from "@/lib/data/categories";
import { BUDGET_LEVEL_STYLES, evaluateBudget } from "@/lib/domain/budget";
import { formatMoney, parseAmount, toMajorString } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ExpenseNature, IncomeType, TransactionDirection } from "@/types/database";

/** The slice of a budget this form needs to warn you before you overspend. */
export type BudgetHint = {
  name: string;
  spent: number;
  limit: number;
  warnThresholdPct: number;
};

export type BudgetHints = {
  byCategory: Record<string, BudgetHint>;
  overall: BudgetHint | null;
};

export type TransactionFormValues = {
  id?: string;
  occurredOn: string;
  amount: number;
  direction: TransactionDirection;
  incomeType: IncomeType | null;
  expenseNature: ExpenseNature | null;
  categoryId: string | null;
  accountId: string | null;
  merchant: string | null;
  note: string | null;
  tags: string[];
};

type TransactionFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  categories: CategoryOption[];
  accounts: AccountOption[];
  currencySymbol: string;
  currency: string;
  locale: string;
  /** Category ids to float to the front of the picker, most used first. */
  frequentCategoryIds?: string[];
  /** Current month's budgets, so the form can warn before you commit. */
  budgets?: BudgetHints;
  initial?: TransactionFormValues;
  /** Date to prefill when creating. Comes from the server in the user's timezone. */
  defaultDate: string;
  submitLabel?: string;
  /** Clear the form and stay put after a successful save. */
  resetOnSuccess?: boolean;
};

const NATURE_OPTIONS: { value: ExpenseNature; label: string; description: string }[] = [
  { value: "daily", label: "Daily", description: "Ad-hoc, day-to-day spending" },
  { value: "fixed", label: "Fixed", description: "Same amount every month, like rent" },
  { value: "recurring", label: "Recurring", description: "Repeats monthly but the amount varies" },
];

const INCOME_TYPE_OPTIONS: { value: IncomeType; label: string; description: string }[] = [
  { value: "active", label: "Active", description: "Salary, wages, bonus" },
  { value: "passive", label: "Passive", description: "Dividends, bond coupons, rent received" },
];

export function TransactionForm({
  action,
  categories,
  accounts,
  currencySymbol,
  currency,
  locale,
  frequentCategoryIds = [],
  budgets,
  initial,
  defaultDate,
  submitLabel = "Save",
  resetOnSuccess = false,
}: TransactionFormProps) {
  const [state, formAction, isPending] = useActionState(action, IDLE);

  const [direction, setDirection] = useState<TransactionDirection>(initial?.direction ?? "expense");
  const [nature, setNature] = useState<ExpenseNature>(initial?.expenseNature ?? "daily");
  const [incomeType, setIncomeType] = useState<IncomeType>(initial?.incomeType ?? "active");
  const [categoryId, setCategoryId] = useState<string>(initial?.categoryId ?? "");
  // Controlled, because the budget hint has to react as you type.
  const [amountText, setAmountText] = useState(initial ? toMajorString(initial.amount) : "");

  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Only categories of the matching kind can apply, and the ones you reach for
  // most should be the ones you do not have to scroll to.
  const visibleCategories = useMemo(() => {
    const kind = direction === "expense" ? "expense" : "income";
    const matching = categories.filter((category) => category.kind === kind);
    const rank = new Map(frequentCategoryIds.map((id, index) => [id, index]));
    return [...matching].sort((a, b) => {
      const rankA = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rankB = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.sortOrder - b.sortOrder;
    });
  }, [categories, direction, frequentCategoryIds]);

  // Switching between expense and income invalidates whatever was selected.
  // Derived rather than synchronised in an effect, so there is no render where
  // the hidden input still holds a category the new direction cannot use.
  const selectedCategoryId = visibleCategories.some((category) => category.id === categoryId)
    ? categoryId
    : "";

  // Clearing the picker after a save is a state adjustment in response to a
  // changed value, which React handles during render rather than in an effect.
  const [handledStatus, setHandledStatus] = useState(state.status);
  if (state.status !== handledStatus) {
    setHandledStatus(state.status);
    if (resetOnSuccess && state.status === "success") {
      setCategoryId("");
      // form.reset() cannot clear a controlled input, so it is cleared here.
      setAmountText("");
    }
  }

  // Resetting the DOM form and moving focus are external effects, so they do
  // belong here.
  useEffect(() => {
    if (resetOnSuccess && state.status === "success") {
      formRef.current?.reset();
      amountRef.current?.focus();
    }
  }, [resetOnSuccess, state.status]);

  const errors = state.fieldErrors ?? {};

  // What this entry would do to the budgets it touches. Only expenses count
  // against a budget, and an entry being edited is already included in `spent`,
  // so the projection only applies when creating.
  const projectedAmount = direction === "expense" && !initial ? (parseAmount(amountText) ?? 0) : 0;

  const affected = budgets
    ? [
        selectedCategoryId ? budgets.byCategory[selectedCategoryId] : undefined,
        budgets.overall ?? undefined,
      ].filter((hint): hint is BudgetHint => Boolean(hint))
    : [];

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <Segmented
        name="direction"
        value={direction}
        onChange={setDirection}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
        ]}
      />

      <Field label="Amount" htmlFor="amount" error={errors.amount}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
            {currencySymbol}
          </span>
          <Input
            ref={amountRef}
            id="amount"
            name="amount"
            // `decimal` gives a keypad with a decimal point on phones, where
            // `number` would offer spinners nobody wants for money.
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            required
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "amount-error" : undefined}
            className="h-14 pl-10 text-2xl font-semibold tabular"
          />
        </div>
      </Field>

      {direction === "expense" ? (
        <Field
          label="Type of expense"
          htmlFor="expenseNature-daily"
          error={errors.expenseNature}
          hint={NATURE_OPTIONS.find((option) => option.value === nature)?.description}
        >
          <Segmented
            name="expenseNature"
            value={nature}
            onChange={setNature}
            options={NATURE_OPTIONS}
          />
        </Field>
      ) : (
        <Field
          label="Type of income"
          htmlFor="incomeType-active"
          error={errors.incomeType}
          hint={INCOME_TYPE_OPTIONS.find((option) => option.value === incomeType)?.description}
        >
          <Segmented
            name="incomeType"
            value={incomeType}
            onChange={setIncomeType}
            options={INCOME_TYPE_OPTIONS}
          />
        </Field>
      )}

      <Field label="Category" htmlFor="categoryId" error={errors.categoryId}>
        <input type="hidden" name="categoryId" value={selectedCategoryId} />
        <div className="flex flex-wrap gap-1.5">
          {visibleCategories.map((category) => {
            const active = selectedCategoryId === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(active ? "" : category.id)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-accent bg-accent/10 font-medium text-accent"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: category.color }}
                  aria-hidden
                />
                {category.name}
              </button>
            );
          })}
        </div>
      </Field>

      {affected.length > 0 ? (
        <ul className="space-y-1.5">
          {affected.map((hint) => {
            const evaluation = evaluateBudget({
              spent: hint.spent + projectedAmount,
              limit: hint.limit,
              warnThresholdPct: hint.warnThresholdPct,
            });
            const styles = BUDGET_LEVEL_STYLES[evaluation.level];

            return (
              <li
                key={hint.name}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-surface-muted px-3 py-2 text-xs"
              >
                <span className="font-medium">{hint.name}</span>
                <span className="tabular text-muted-foreground">
                  {formatMoney(evaluation.spent, currency, locale)} of{" "}
                  {formatMoney(evaluation.limit, currency, locale)}
                </span>
                <span className={cn("ml-auto font-medium", styles.text)}>
                  {Math.round(evaluation.pctUsed)}%
                  {evaluation.level === "exceeded"
                    ? ` · ${formatMoney(evaluation.overspend, currency, locale)} over`
                    : evaluation.level === "warning"
                      ? " · close to limit"
                      : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor="occurredOn" error={errors.occurredOn}>
          <Input
            id="occurredOn"
            name="occurredOn"
            type="date"
            required
            defaultValue={initial?.occurredOn ?? defaultDate}
            aria-invalid={Boolean(errors.occurredOn)}
          />
        </Field>

        <Field label="Account" htmlFor="accountId" error={errors.accountId}>
          <Select id="accountId" name="accountId" defaultValue={initial?.accountId ?? ""}>
            <option value="">Not specified</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">
          More details
        </summary>
        <div className="space-y-4 border-t border-border p-4">
          <Field label="Merchant" htmlFor="merchant" error={errors.merchant}>
            <Input
              id="merchant"
              name="merchant"
              placeholder="Where was it?"
              defaultValue={initial?.merchant ?? ""}
            />
          </Field>

          <Field
            label="Tags"
            htmlFor="tags"
            hint="Comma separated, e.g. work, reimbursable"
          >
            <Input id="tags" name="tags" defaultValue={initial?.tags.join(", ") ?? ""} />
          </Field>

          <Field label="Note" htmlFor="note" error={errors.note}>
            <Textarea id="note" name="note" defaultValue={initial?.note ?? ""} />
          </Field>
        </div>
      </details>

      {state.message ? (
        <p
          role="status"
          className={cn(
            "text-sm",
            state.status === "error"
              ? "text-rose-600 dark:text-rose-400"
              : "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
