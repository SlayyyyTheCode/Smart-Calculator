import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();

  const [{ data: profile }, { data: categories }, { data: accounts }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, base_currency, locale, timezone, month_start_day")
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, name, kind, color")
      .eq("is_archived", false)
      .order("kind")
      .order("sort_order"),
    supabase
      .from("accounts")
      .select("id, name, type, currency, is_liquid")
      .eq("is_archived", false)
      .order("name"),
  ]);

  const expenseCategories = categories?.filter((c) => c.kind === "expense") ?? [];
  const incomeCategories = categories?.filter((c) => c.kind === "income") ?? [];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Categories, accounts, currency and the thresholds that trigger budget warnings."
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Read-only for now; editing arrives in phase 1.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Display name</dt>
              <dd className="font-medium">{profile?.display_name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Base currency</dt>
              <dd className="font-medium">{profile?.base_currency ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Locale</dt>
              <dd className="font-medium">{profile?.locale ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Month starts on day</dt>
              <dd className="font-medium">{profile?.month_start_day ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>
              {expenseCategories.length} expense · {incomeCategories.length} income
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["expense", "income"] as const).map((kind) => {
              const list = kind === "expense" ? expenseCategories : incomeCategories;
              if (list.length === 0) return null;
              return (
                <div key={kind}>
                  <p className="pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {kind}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {list.map((category) => (
                      <li
                        key={category.id}
                        className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: category.color }}
                          aria-hidden
                        />
                        {category.name}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <CardDescription>Liquid accounts feed the runway calculation.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {accounts?.map((account) => (
                <li key={account.id} className="flex items-center justify-between py-2">
                  <span className="font-medium">{account.name}</span>
                  <span className="text-muted-foreground">
                    {account.type} · {account.currency}
                    {account.is_liquid ? " · liquid" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <PhaseNotice phase="phase 1">
        Creating, renaming, recolouring and archiving categories and accounts, plus editing your
        base currency, locale and salary-cycle month start.
      </PhaseNotice>
    </>
  );
}
