import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RecurringRuleForm } from "@/components/recurring/recurring-rule-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { deleteRecurringRule, updateRecurringRule } from "@/lib/actions/recurring";
import { currencySymbol } from "@/lib/currency";
import { listAccounts } from "@/lib/data/accounts";
import { listCategories } from "@/lib/data/categories";
import { getFormatting } from "@/lib/data/profile";
import { getRecurringRule } from "@/lib/data/recurring";
import { todayIso } from "@/lib/date";

export const metadata: Metadata = { title: "Edit rule" };

export default async function EditRecurringRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [rule, formatting, categories, accounts] = await Promise.all([
    getRecurringRule(id),
    getFormatting(),
    listCategories(),
    listAccounts(),
  ]);

  if (!rule) notFound();

  return (
    <>
      <PageHeader
        title="Edit rule"
        description="Changes apply to future occurrences. Entries already posted stay as they are."
      />

      <Card className="mx-auto w-full max-w-2xl">
        <CardContent className="pt-5">
          <RecurringRuleForm
            action={updateRecurringRule}
            categories={categories}
            accounts={accounts}
            currencySymbol={currencySymbol(formatting.currency, formatting.locale)}
            defaultDate={todayIso(formatting.timezone)}
            initial={rule}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>

      <div className="mx-auto flex w-full max-w-2xl items-center justify-between text-sm">
        <Link href="/recurring" className="text-muted-foreground hover:text-foreground">
          ← Back to rules
        </Link>
        <form action={deleteRecurringRule}>
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="redirectTo" value="/recurring" />
          <button
            type="submit"
            title="Entries this rule already posted are kept."
            className="text-rose-600 hover:underline dark:text-rose-400"
          >
            Delete this rule
          </button>
        </form>
      </div>
    </>
  );
}
