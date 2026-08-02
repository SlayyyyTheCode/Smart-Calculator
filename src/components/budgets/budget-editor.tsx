"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { copyBudgetsFromPreviousMonth, saveBudgets } from "@/lib/actions/budgets";
import { IDLE } from "@/lib/actions/result";
import type { BudgetRecord } from "@/lib/data/budgets";
import type { CategoryOption } from "@/lib/data/categories";
import { DEFAULT_WARN_THRESHOLD_PCT } from "@/lib/domain/budget";
import { toMajorString } from "@/lib/money";
import { cn } from "@/lib/utils";

type BudgetEditorProps = {
  periodMonth: string;
  categories: CategoryOption[];
  budgets: BudgetRecord[];
  currencySymbol: string;
};

/**
 * The whole month in one form. Every expense category gets a box; leaving one
 * blank means it has no cap, and clearing a box that had a figure removes that
 * budget. One submit, one round trip, no per-row save buttons.
 */
export function BudgetEditor({
  periodMonth,
  categories,
  budgets,
  currencySymbol,
}: BudgetEditorProps) {
  const [state, formAction, isPending] = useActionState(saveBudgets, IDLE);
  const [copyState, copyAction, isCopying] = useActionState(
    copyBudgetsFromPreviousMonth,
    IDLE,
  );

  const byCategory = new Map(budgets.map((budget) => [budget.categoryId, budget]));
  const overall = byCategory.get(null);
  const threshold = budgets[0]?.warnThresholdPct ?? DEFAULT_WARN_THRESHOLD_PCT;

  const expenseCategories = categories.filter(
    (category) => category.kind === "expense" && !category.isArchived,
  );

  function valueFor(categoryId: string | null): string {
    const budget = byCategory.get(categoryId);
    return budget ? toMajorString(budget.limitAmount) : "";
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="periodMonth" value={periodMonth} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Overall cap for the month"
            htmlFor="limit-overall"
            hint="Optional. Measured against every expense, whatever its category."
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {currencySymbol}
              </span>
              <Input
                id="limit-overall"
                name="limit:overall"
                inputMode="decimal"
                placeholder="No cap"
                defaultValue={overall ? toMajorString(overall.limitAmount) : ""}
                className="pl-9 tabular"
              />
            </div>
          </Field>

          <Field
            label="Warn me at"
            htmlFor="warnThresholdPct"
            hint="Percentage of a budget at which it turns amber. Applies to every budget in this month."
          >
            <div className="relative">
              <Input
                id="warnThresholdPct"
                name="warnThresholdPct"
                type="number"
                min={1}
                max={100}
                defaultValue={threshold}
                className="pr-8 tabular"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                %
              </span>
            </div>
          </Field>
        </div>

        <div>
          <h3 className="pb-2 text-sm font-medium">Per category</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {expenseCategories.map((category) => (
              <label
                key={category.id}
                className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: category.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
                <span className="text-xs text-muted-foreground">{currencySymbol}</span>
                <Input
                  name={`limit:${category.id}`}
                  inputMode="decimal"
                  placeholder="—"
                  defaultValue={valueFor(category.id)}
                  aria-label={`${category.name} budget`}
                  className="tabular h-8 w-24 text-right"
                />
              </label>
            ))}
          </div>
        </div>

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
          {isPending ? "Saving…" : "Save budgets"}
        </Button>
      </form>

      <form action={copyAction} className="flex items-center gap-3 border-t border-border pt-4">
        <input type="hidden" name="periodMonth" value={periodMonth} />
        <Button type="submit" variant="outline" size="sm" disabled={isCopying}>
          {isCopying ? "Copying…" : "Copy from last month"}
        </Button>
        {copyState.message ? (
          <p
            role="status"
            className={cn(
              "text-sm",
              copyState.status === "error"
                ? "text-rose-600 dark:text-rose-400"
                : "text-muted-foreground",
            )}
          >
            {copyState.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
