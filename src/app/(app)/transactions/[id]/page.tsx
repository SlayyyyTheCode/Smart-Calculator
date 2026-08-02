import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TransactionForm } from "@/components/transactions/transaction-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import { currencySymbol } from "@/lib/currency";
import { listAccounts } from "@/lib/data/accounts";
import { listCategories } from "@/lib/data/categories";
import { getFormatting } from "@/lib/data/profile";
import { getTransaction } from "@/lib/data/transactions";
import { todayIso } from "@/lib/date";

export const metadata: Metadata = { title: "Edit transaction" };

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [transaction, formatting, categories, accounts] = await Promise.all([
    getTransaction(id),
    getFormatting(),
    listCategories(),
    listAccounts(),
  ]);

  // RLS returns nothing for someone else's row, so "not yours" and "not there"
  // are the same 404 — which is the right thing to leak, namely nothing.
  if (!transaction) notFound();

  const isDraft = transaction.status === "draft";

  return (
    <>
      <PageHeader
        title={isDraft ? "Confirm this entry" : "Edit transaction"}
        description={
          isDraft
            ? "This was forecast from a recurring rule. Enter the real amount to confirm it and include it in your totals."
            : undefined
        }
      />

      <Card className="mx-auto w-full max-w-lg">
        <CardContent className="pt-5">
          <TransactionForm
            action={updateTransaction}
            categories={categories}
            accounts={accounts}
            currencySymbol={currencySymbol(formatting.currency, formatting.locale)}
            defaultDate={todayIso(formatting.timezone)}
            initial={{
              id: transaction.id,
              occurredOn: transaction.occurredOn,
              amount: transaction.amount,
              direction: transaction.direction,
              incomeType: transaction.incomeType,
              expenseNature: transaction.expenseNature,
              categoryId: transaction.categoryId,
              accountId: transaction.accountId,
              merchant: transaction.merchant,
              note: transaction.note,
              tags: transaction.tags,
            }}
            submitLabel={isDraft ? "Confirm entry" : "Save changes"}
          />
        </CardContent>
      </Card>

      <div className="mx-auto flex w-full max-w-lg items-center justify-between text-sm">
        <Link href="/transactions" className="text-muted-foreground hover:text-foreground">
          ← Back to transactions
        </Link>
        <form action={deleteTransaction}>
          <input type="hidden" name="id" value={transaction.id} />
          <input type="hidden" name="redirectTo" value="/transactions" />
          <button type="submit" className="text-rose-600 hover:underline dark:text-rose-400">
            Delete this entry
          </button>
        </form>
      </div>
    </>
  );
}
