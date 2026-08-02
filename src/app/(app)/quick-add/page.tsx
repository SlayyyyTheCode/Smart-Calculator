import type { Metadata } from "next";
import Link from "next/link";

import { TransactionForm } from "@/components/transactions/transaction-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { createTransaction } from "@/lib/actions/transactions";
import { currencySymbol } from "@/lib/currency";
import { listAccounts } from "@/lib/data/accounts";
import { listCategories } from "@/lib/data/categories";
import { getFormatting } from "@/lib/data/profile";
import { getBudgetLookup } from "@/lib/data/budgets";
import { listFrequentCategoryIds } from "@/lib/data/transactions";
import { startOfMonth, todayIso } from "@/lib/date";

export const metadata: Metadata = { title: "Quick add" };

export default async function QuickAddPage() {
  const [formatting, categories, accounts] = await Promise.all([
    getFormatting(),
    listCategories(),
    listAccounts(),
  ]);

  const today = todayIso(formatting.timezone);
  const [frequentCategoryIds, budgetLookup] = await Promise.all([
    listFrequentCategoryIds("expense"),
    getBudgetLookup(startOfMonth(today)),
  ]);

  // Only the numbers the form needs to warn you, not the whole status object.
  const budgets = {
    byCategory: Object.fromEntries(
      Object.entries(budgetLookup.byCategory).map(([categoryId, status]) => [
        categoryId,
        {
          name: status.categoryName,
          spent: status.evaluation.spent,
          limit: status.evaluation.limit,
          warnThresholdPct: status.evaluation.warnThresholdPct,
        },
      ]),
    ),
    overall: budgetLookup.overall
      ? {
          name: "Everything this month",
          spent: budgetLookup.overall.evaluation.spent,
          limit: budgetLookup.overall.evaluation.limit,
          warnThresholdPct: budgetLookup.overall.evaluation.warnThresholdPct,
        }
      : null,
  };

  return (
    <>
      <PageHeader
        title="Quick add"
        description="Record it now, sort out the detail later."
      />

      <Card className="mx-auto w-full max-w-lg">
        <CardContent className="pt-5">
          <TransactionForm
            action={createTransaction}
            categories={categories}
            accounts={accounts}
            currencySymbol={currencySymbol(formatting.currency, formatting.locale)}
            currency={formatting.currency}
            locale={formatting.locale}
            frequentCategoryIds={frequentCategoryIds}
            budgets={budgets}
            // Today in the user's own timezone, decided on the server so it
            // does not depend on the device clock.
            defaultDate={today}
            submitLabel="Record it"
            resetOnSuccess
            queueWhenOffline
          />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Looking for something you already recorded?{" "}
        <Link href="/transactions" className="text-accent hover:underline">
          Browse transactions
        </Link>
      </p>
    </>
  );
}
