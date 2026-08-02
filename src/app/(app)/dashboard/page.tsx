import type { Metadata } from "next";
import Link from "next/link";
import { Check, Circle } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetStatusList } from "@/components/budgets/budget-status-list";
import { listBudgetStatus } from "@/lib/data/budgets";
import { getFormatting } from "@/lib/data/profile";
import { countPendingDrafts } from "@/lib/data/recurring";
import { formatMonthLabel, startOfMonth, todayIso } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

type SetupStep = {
  label: string;
  href: string;
  done: boolean;
  hint: string;
};

/**
 * Phase 0 dashboard. It proves the database round trip works end to end and
 * tells you what to set up next. Phase 3 replaces the checklist with the real
 * KPI tiles, category breakdown and trend chart.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const formatting = await getFormatting();
  const periodMonth = startOfMonth(todayIso(formatting.timezone));

  const [budgetStatuses, draftCount] = await Promise.all([
    listBudgetStatus(periodMonth),
    countPendingDrafts(),
  ]);

  const [categories, accounts, transactions, budgets, recurring] = await Promise.all([
    supabase.from("categories").select("id", { count: "exact", head: true }),
    supabase.from("accounts").select("id", { count: "exact", head: true }),
    supabase.from("transactions").select("id", { count: "exact", head: true }),
    supabase.from("budgets").select("id", { count: "exact", head: true }),
    supabase.from("recurring_rules").select("id", { count: "exact", head: true }),
  ]);

  const steps: SetupStep[] = [
    {
      label: "Categories created",
      href: "/settings",
      done: (categories.count ?? 0) > 0,
      hint: "A starter set is seeded on your first sign-in. Rename or archive what you do not use.",
    },
    {
      label: "Accounts created",
      href: "/settings",
      done: (accounts.count ?? 0) > 0,
      hint: "Cash, bank and brokerage are seeded. Liquid accounts feed the runway figure.",
    },
    {
      label: "First expense recorded",
      href: "/quick-add",
      done: (transactions.count ?? 0) > 0,
      hint: "Two taps from your phone. Works offline once the PWA lands in phase 5.",
    },
    {
      label: "Monthly commitments set up",
      href: "/recurring",
      done: (recurring.count ?? 0) > 0,
      hint: "Fixed amounts post themselves; variable ones post a draft you confirm.",
    },
    {
      label: "Budgets defined",
      href: "/budgets",
      done: (budgets.count ?? 0) > 0,
      hint: "Set a monthly cap per category to switch on the warning indicators.",
    },
  ];

  const completed = steps.filter((step) => step.done).length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Where your money went this month, how close you are to your budgets, and how much of your spending your passive income already covers."
      />

      {draftCount > 0 ? (
        <Link
          href="/transactions?status=draft&month=all"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm transition-colors hover:bg-amber-500/15"
        >
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {draftCount} {draftCount === 1 ? "draft needs" : "drafts need"} a real amount
          </span>
          <span className="text-muted-foreground">
            — forecast from your recurring rules, and left out of these totals until confirmed.
          </span>
        </Link>
      ) : null}

      {budgetStatuses.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Budgets · {formatMonthLabel(periodMonth, formatting.locale)}
            </CardTitle>
            <CardDescription>
              {budgetStatuses.some((status) => status.evaluation.level !== "ok")
                ? "The ones needing attention are first."
                : "Everything is inside its limit."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetStatusList
              statuses={budgetStatuses.slice(0, 5)}
              currency={formatting.currency}
              locale={formatting.locale}
            />
            {budgetStatuses.length > 5 ? (
              <Link
                href="/budgets"
                className="mt-3 inline-block text-sm text-accent hover:underline"
              >
                See all {budgetStatuses.length} budgets →
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Getting set up</CardTitle>
          <CardDescription>
            {completed} of {steps.length} steps done
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {steps.map((step) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className="flex items-start gap-3 py-3 transition-colors hover:text-accent"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                      step.done
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-surface-muted text-muted-foreground",
                    )}
                  >
                    {step.done ? (
                      <Check className="size-3" aria-hidden />
                    ) : (
                      <Circle className="size-2.5" aria-hidden />
                    )}
                  </span>
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{step.label}</span>
                    <span className="block text-sm text-muted-foreground">{step.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <PhaseNotice phase="phase 3">
        Spend and income tiles, the category breakdown that answers &ldquo;where is my largest
        expense&rdquo;, a twelve-month trend, and the three derived metrics: FIRE coverage
        (passive income against spending), savings rate, and runway.
      </PhaseNotice>
    </>
  );
}
