import type { Metadata } from "next";
import { Target } from "lucide-react";

import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { EntityField, EntityForm } from "@/components/wealth/entity-form";
import { GoalList } from "@/components/wealth/goal-list";
import { saveGoal } from "@/lib/actions/wealth";
import { currencySymbol } from "@/lib/currency";
import { getFormatting } from "@/lib/data/profile";
import { listGoals } from "@/lib/data/wealth";
import { todayIso } from "@/lib/date";
import { summariseGoals } from "@/lib/domain/goals";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Goals" };

export default async function GoalsPage() {
  const [formatting, goals] = await Promise.all([getFormatting(), listGoals()]);
  const today = todayIso(formatting.timezone);
  const summary = summariseGoals(goals, today);
  const symbol = currencySymbol(formatting.currency, formatting.locale);

  const money = (minor: number) => formatMoney(minor, formatting.currency, formatting.locale);

  return (
    <>
      <PageHeader
        title="Goals"
        description="Save toward something by a date, and see what that means each month."
      />

      {goals.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Saved so far"
            value={money(summary.savedTotal)}
            hint={`of ${money(summary.targetTotal)} across ${summary.count} ${summary.count === 1 ? "goal" : "goals"}`}
          />
          <StatTile
            label="Needed each month"
            value={money(summary.monthlyTotal)}
            hint="To reach every goal that has a date, on time."
          />
          <StatTile
            label="Reached"
            value={`${summary.completed} of ${summary.count}`}
          />
        </div>
      ) : null}

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Add one below — a holiday, a deposit, an emergency fund — and this page works out what to set aside each month."
        />
      ) : (
        <GoalList
          goals={goals}
          currency={formatting.currency}
          locale={formatting.locale}
          today={today}
          currencySymbol={symbol}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a goal</CardTitle>
          <CardDescription>
            A target date is optional, but without one there is no monthly figure to work to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntityForm action={saveGoal} submitLabel="Add goal">
            <div className="grid gap-4 sm:grid-cols-2">
              <EntityField name="name" label="Name" htmlFor="goal-name">
                <Input id="goal-name" name="name" required placeholder="e.g. Japan trip" />
              </EntityField>

              <EntityField name="targetAmount" label="Target amount" htmlFor="goal-target">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    id="goal-target"
                    name="targetAmount"
                    inputMode="decimal"
                    required
                    placeholder="0.00"
                    className="pl-9 tabular"
                  />
                </div>
              </EntityField>

              <EntityField name="currentAmount" label="Already saved" htmlFor="goal-current">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    id="goal-current"
                    name="currentAmount"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="pl-9 tabular"
                  />
                </div>
              </EntityField>

              <EntityField name="targetDate" label="Target date" htmlFor="goal-date">
                <Input id="goal-date" name="targetDate" type="date" />
              </EntityField>
            </div>

            <EntityField name="note" label="Note" htmlFor="goal-note">
              <Textarea id="goal-note" name="note" />
            </EntityField>
          </EntityForm>
        </CardContent>
      </Card>
    </>
  );
}
