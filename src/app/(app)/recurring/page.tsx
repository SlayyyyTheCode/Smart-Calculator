import type { Metadata } from "next";
import Link from "next/link";
import { Repeat } from "lucide-react";

import { RecurringRuleForm } from "@/components/recurring/recurring-rule-form";
import { RuleList } from "@/components/recurring/rule-list";
import { RunNowButton } from "@/components/recurring/run-now-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { createRecurringRule } from "@/lib/actions/recurring";
import { currencySymbol } from "@/lib/currency";
import { listAccounts } from "@/lib/data/accounts";
import { listCategories } from "@/lib/data/categories";
import { getFormatting } from "@/lib/data/profile";
import { countPendingDrafts, listRecurringRules } from "@/lib/data/recurring";
import { todayIso } from "@/lib/date";

export const metadata: Metadata = { title: "Fixed & recurring" };

export default async function RecurringPage() {
  const [rules, formatting, categories, accounts, draftCount] = await Promise.all([
    listRecurringRules(),
    getFormatting(),
    listCategories(),
    listAccounts(),
    countPendingDrafts(),
  ]);

  const today = todayIso(formatting.timezone);

  const fixed = rules.filter(
    (rule) => rule.direction === "expense" && rule.expenseNature === "fixed",
  );
  const variable = rules.filter(
    (rule) => rule.direction === "expense" && rule.expenseNature === "recurring",
  );
  const income = rules.filter((rule) => rule.direction === "income");

  const groups = [
    {
      key: "fixed",
      title: "Fixed",
      description: "Same amount every period. Posted automatically and counted straight away.",
      rules: fixed,
    },
    {
      key: "recurring",
      title: "Recurring",
      description:
        "Repeats every period but the amount varies. A draft is posted from your estimate and stays out of your totals until you confirm the real figure.",
      rules: variable,
    },
    {
      key: "income",
      title: "Income",
      description: "Salary, dividends and anything else arriving on a schedule.",
      rules: income,
    },
  ];

  return (
    <>
      <PageHeader
        title="Fixed & recurring"
        description="Your monthly commitments, kept in separate buckets so a predictable bill and a variable one are never confused."
        actions={<RunNowButton />}
      />

      {draftCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {draftCount} {draftCount === 1 ? "draft is" : "drafts are"} waiting for a real amount.
          </span>
          <span className="text-muted-foreground">
            They stay out of your totals until confirmed.
          </span>
          <Link
            href="/transactions?status=draft&month=all"
            className="ml-auto font-medium text-accent hover:underline"
          >
            Confirm them →
          </Link>
        </div>
      ) : null}

      {rules.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring rules yet"
          description="Add your rent, your insurance, your utilities and your salary once, and they will post themselves from then on."
        />
      ) : (
        groups.map((group) =>
          group.rules.length === 0 ? null : (
            <section key={group.key} className="space-y-2">
              <div>
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <p className="text-sm text-muted-foreground">{group.description}</p>
              </div>
              <RuleList
                rules={group.rules}
                currency={formatting.currency}
                locale={formatting.locale}
                today={today}
              />
            </section>
          ),
        )
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a rule</CardTitle>
          <CardDescription>
            Anything you pay or receive on a schedule. Past occurrences are caught up the first
            time it runs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecurringRuleForm
            action={createRecurringRule}
            categories={categories}
            accounts={accounts}
            currencySymbol={currencySymbol(formatting.currency, formatting.locale)}
            defaultDate={today}
            submitLabel="Add rule"
            resetOnSuccess
          />
        </CardContent>
      </Card>
    </>
  );
}
