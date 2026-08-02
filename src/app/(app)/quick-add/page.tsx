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
import { listFrequentCategoryIds } from "@/lib/data/transactions";
import { todayIso } from "@/lib/date";

export const metadata: Metadata = { title: "Quick add" };

export default async function QuickAddPage() {
  const [formatting, categories, accounts] = await Promise.all([
    getFormatting(),
    listCategories(),
    listAccounts(),
  ]);

  const frequentCategoryIds = await listFrequentCategoryIds("expense");

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
            frequentCategoryIds={frequentCategoryIds}
            // Today in the user's own timezone, decided on the server so it
            // does not depend on the device clock.
            defaultDate={todayIso(formatting.timezone)}
            submitLabel="Record it"
            resetOnSuccess
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
