"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/field";
import { IDLE, type ActionState } from "@/lib/actions/result";
import type { AccountOption } from "@/lib/data/accounts";
import type { CategoryOption } from "@/lib/data/categories";
import type { RecurringRuleItem } from "@/lib/data/recurring";
import { toMajorString } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { IncomeType, RecurrenceFrequency, TransactionDirection } from "@/types/database";

/** The three kinds of rule, as the user thinks about them. */
type RuleKind = "fixed" | "recurring" | "income";

type RecurringRuleFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  categories: CategoryOption[];
  accounts: AccountOption[];
  currencySymbol: string;
  defaultDate: string;
  initial?: RecurringRuleItem;
  submitLabel?: string;
  resetOnSuccess?: boolean;
};

const KIND_OPTIONS: { value: RuleKind; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "recurring", label: "Recurring" },
  { value: "income", label: "Income" },
];

const KIND_HINT: Record<RuleKind, string> = {
  fixed:
    "Same amount every period — rent, insurance, a loan payment. Posted automatically and counted straight away.",
  recurring:
    "Repeats every period but the amount moves — electricity, groceries, fuel. A draft is posted from your estimate and stays out of your totals until you confirm the real figure.",
  income:
    "Money coming in on a schedule — salary, a dividend, rent you receive. Posted automatically at the amount you set.",
};

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

function initialKind(rule: RecurringRuleItem | undefined): RuleKind {
  if (!rule) return "fixed";
  if (rule.direction === "income") return "income";
  return rule.expenseNature === "recurring" ? "recurring" : "fixed";
}

export function RecurringRuleForm({
  action,
  categories,
  accounts,
  currencySymbol,
  defaultDate,
  initial,
  submitLabel = "Save rule",
  resetOnSuccess = false,
}: RecurringRuleFormProps) {
  const [state, formAction, isPending] = useActionState(action, IDLE);
  const [kind, setKind] = useState<RuleKind>(initialKind(initial));
  const [incomeType, setIncomeType] = useState<IncomeType>(initial?.incomeType ?? "active");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(initial?.frequency ?? "monthly");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.status === "success") formRef.current?.reset();
  }, [resetOnSuccess, state.status]);

  const errors = state.fieldErrors ?? {};
  const direction: TransactionDirection = kind === "income" ? "income" : "expense";
  const isVariable = kind === "recurring";
  const categoryKind = direction === "income" ? "income" : "expense";
  const visibleCategories = categories.filter((category) => category.kind === categoryKind);

  // A variable rule stores its figure in estimated_amount, a fixed one in
  // amount. One visible field, two destinations.
  const amountName = isVariable ? "estimatedAmount" : "amount";
  const amountError = errors.estimatedAmount ?? errors.amount;
  const amountValue = initial
    ? toMajorString((isVariable ? initial.estimatedAmount : initial.amount) ?? 0)
    : "";

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="direction" value={direction} />
      {direction === "expense" ? (
        <input type="hidden" name="expenseNature" value={isVariable ? "recurring" : "fixed"} />
      ) : null}

      <Field label="Kind" htmlFor="kind-fixed" hint={KIND_HINT[kind]}>
        <Segmented name="kind" value={kind} onChange={setKind} options={KIND_OPTIONS} />
      </Field>

      <Field label="Name" htmlFor="label" error={errors.label}>
        <Input
          id="label"
          name="label"
          required
          placeholder={kind === "income" ? "e.g. Salary" : "e.g. Rent"}
          defaultValue={initial?.label ?? ""}
        />
      </Field>

      {direction === "income" ? (
        <Field label="Income type" htmlFor="incomeType-active" error={errors.incomeType}>
          <Segmented
            name="incomeType"
            value={incomeType}
            onChange={setIncomeType}
            options={[
              { value: "active", label: "Active" },
              { value: "passive", label: "Passive" },
            ]}
          />
        </Field>
      ) : null}

      <Field
        label={isVariable ? "Usual amount" : "Amount"}
        htmlFor="rule-amount"
        error={amountError}
        hint={
          isVariable
            ? "Your best estimate. The draft uses this until you enter the real figure."
            : undefined
        }
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {currencySymbol}
          </span>
          <Input
            id="rule-amount"
            name={amountName}
            inputMode="decimal"
            required
            placeholder="0.00"
            defaultValue={amountValue}
            aria-invalid={Boolean(amountError)}
            className="pl-9 tabular"
          />
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="rule-category" error={errors.categoryId}>
          <Select id="rule-category" name="categoryId" defaultValue={initial?.categoryId ?? ""}>
            <option value="">Not specified</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Account" htmlFor="rule-account" error={errors.accountId}>
          <Select id="rule-account" name="accountId" defaultValue={initial?.accountId ?? ""}>
            <option value="">Not specified</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Repeats" htmlFor="frequency" error={errors.frequency}>
          <Select
            id="frequency"
            name="frequency"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as RecurrenceFrequency)}
          >
            {FREQUENCIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Every"
          htmlFor="intervalCount"
          error={errors.intervalCount}
          hint="2 means every other period."
        >
          <Input
            id="intervalCount"
            name="intervalCount"
            type="number"
            min={1}
            max={12}
            defaultValue={initial?.intervalCount ?? 1}
          />
        </Field>

        {frequency !== "weekly" ? (
          <Field
            label="Day of month"
            htmlFor="dayOfMonth"
            error={errors.dayOfMonth}
            hint="Leave blank to use the start date's day. The 31st becomes the 28th in February and returns to the 31st afterwards."
          >
            <Input
              id="dayOfMonth"
              name="dayOfMonth"
              type="number"
              min={1}
              max={31}
              defaultValue={initial?.dayOfMonth ?? ""}
            />
          </Field>
        ) : null}

        <Field
          label="Starts"
          htmlFor="startDate"
          error={errors.startDate}
          hint="Occurrences from this date onward are posted, catching up if needed."
        >
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={initial?.startDate ?? defaultDate}
          />
        </Field>

        <Field label="Ends" htmlFor="endDate" error={errors.endDate} hint="Optional.">
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={initial?.endDate ?? ""}
          />
        </Field>
      </div>

      <Field label="Note" htmlFor="rule-note" error={errors.note}>
        <Textarea id="rule-note" name="note" defaultValue={initial?.note ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          value="true"
          defaultChecked={initial?.isActive ?? true}
          className="size-4"
        />
        Active
      </label>

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

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
