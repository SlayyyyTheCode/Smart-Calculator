import type { Metadata } from "next";
import { Wallet } from "lucide-react";

import { BudgetEditor } from "@/components/budgets/budget-editor";
import { BudgetStatusList } from "@/components/budgets/budget-status-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { currencySymbol } from "@/lib/currency";
import { listBudgets, listBudgetStatus } from "@/lib/data/budgets";
import { listCategories } from "@/lib/data/categories";
import { getFormatting } from "@/lib/data/profile";
import { addMonths, formatMonthLabel, startOfMonth, todayIso } from "@/lib/date";

export const metadata: Metadata = { title: "Budgets" };

const MONTH = /^\d{4}-\d{2}-\d{2}$/;

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const formatting = await getFormatting();
  const today = todayIso(formatting.timezone);

  const rawMonth = Array.isArray(params.month) ? params.month[0] : params.month;
  const periodMonth =
    rawMonth && MONTH.test(rawMonth) ? startOfMonth(rawMonth) : startOfMonth(today);

  const [statuses, budgets, categories] = await Promise.all([
    listBudgetStatus(periodMonth),
    listBudgets(periodMonth),
    listCategories(),
  ]);

  const currentMonth = startOfMonth(today);
  const months = Array.from({ length: 15 }, (_, index) => addMonths(currentMonth, 2 - index));
  if (!months.includes(periodMonth)) months.unshift(periodMonth);

  const warnings = statuses.filter((status) => status.evaluation.level !== "ok");

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Decide what you intend to spend, and get told as you approach it rather than after you have passed it."
        actions={
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="month" className="sr-only">
              Month
            </label>
            <Select id="month" name="month" defaultValue={periodMonth} className="w-44">
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonthLabel(month, formatting.locale)}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="outline" size="sm">
              Go
            </Button>
          </form>
        }
      />

      {statuses.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={`No budgets for ${formatMonthLabel(periodMonth, formatting.locale)}`}
          description="Set a cap below and this page starts tracking what you have spent against it."
        />
      ) : (
        <section className="space-y-3">
          {warnings.length > 0 ? (
            <p className="text-sm">
              <span className="font-medium">
                {warnings.length} {warnings.length === 1 ? "budget needs" : "budgets need"}{" "}
                attention
              </span>{" "}
              <span className="text-muted-foreground">— shown first below.</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Everything is inside its limit this month.
            </p>
          )}

          <BudgetStatusList
            statuses={statuses}
            currency={formatting.currency}
            locale={formatting.locale}
          />
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Set budgets for {formatMonthLabel(periodMonth, formatting.locale)}
          </CardTitle>
          <CardDescription>
            Leave a category blank for no cap. Clearing a figure removes that budget.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BudgetEditor
            periodMonth={periodMonth}
            categories={categories}
            budgets={budgets}
            currencySymbol={currencySymbol(formatting.currency, formatting.locale)}
          />
        </CardContent>
      </Card>
    </>
  );
}
