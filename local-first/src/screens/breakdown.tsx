import { useState } from "react";
import { PieChart } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { EmptyState } from "@app/components/ui/empty-state";
import { Field, Input } from "@app/components/ui/field";
import { PageHeader } from "@app/components/ui/page-header";
import { addDays, addMonths, formatDateLabel } from "@app/lib/date";

import { Donut, type Slice } from "../components/donut";
import type { CategoryRow, TransactionRow } from "../db";
import { useMoneyFormat } from "../money-format";
import { categoryTotalsInRange } from "../repository";
import { TODAY } from "../today";

/**
 * How many categories get their own slice before the rest become Other.
 *
 * A donut answers "is one of these most of it?" and answers little else. Past
 * about six arcs they stop being comparable by eye and the chart becomes a
 * legend with decoration attached. Five plus a remainder is the honest ceiling;
 * the table underneath carries every category, which is where anyone comparing
 * seventh against eighth should be looking anyway.
 */
const SLICES = 5;

type Range = { label: string; from: string; to: string; testid: string };

/**
 * Days, months, years, and then whatever you type.
 *
 * The presets cover what people actually ask for, and the two date fields cover
 * everything else, because a preset list is always missing the one period
 * somebody cares about.
 */
function presets(today: string): Range[] {
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  return [
    { label: "7 days", from: addDays(today, -6), to: today, testid: "range-7d" },
    { label: "30 days", from: addDays(today, -29), to: today, testid: "range-30d" },
    { label: "This month", from: `${month}-01`, to: today, testid: "range-month" },
    { label: "3 months", from: addMonths(today, -3), to: today, testid: "range-3m" },
    { label: "This year", from: `${year}-01-01`, to: today, testid: "range-year" },
    { label: "All time", from: "0000-01-01", to: today, testid: "range-all" },
  ];
}

export function Breakdown({
  transactions,
  categories,
}: {
  transactions: readonly TransactionRow[];
  categories: readonly CategoryRow[];
}) {
  const { money, locale } = useMoneyFormat();
  const ranges = presets(TODAY);
  const [chosen, setChosen] = useState(2);
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);

  const range = custom
    ? { label: "Custom", from: custom.from, to: custom.to, testid: "range-custom" }
    : ranges[chosen];

  const totals = categoryTotalsInRange(transactions, categories, range.from, range.to);
  const total = totals.reduce((sum, row) => sum + row.amount, 0);

  // Already ranked biggest-first by the repository, which is what makes the
  // fold below correct rather than arbitrary.
  const head = totals.slice(0, SLICES);
  const tail = totals.slice(SLICES);
  const tailTotal = tail.reduce((sum, row) => sum + row.amount, 0);

  const slices: Slice[] = [
    ...head.map((row) => ({ label: row.categoryName, amount: row.amount })),
    ...(tailTotal > 0
      ? [{ label: `Other (${tail.length})`, amount: tailTotal, isOther: true }]
      : []),
  ];

  const spanLabel =
    range.from === "0000-01-01"
      ? "everything recorded"
      : `${formatDateLabel(range.from, locale)} to ${formatDateLabel(range.to, locale)}`;

  return (
    <>
      <PageHeader
        title="Where it went"
        description="Your spending by category, over any period you choose."
      />

      <Card>
        <CardHeader>
          <CardTitle>Period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2" data-testid="range-picker">
            {ranges.map((option, index) => {
              const on = !custom && index === chosen;
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={on}
                  data-testid={option.testid}
                  onClick={() => {
                    setCustom(null);
                    setChosen(index);
                  }}
                  className={
                    on
                      ? "rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
                      : "rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-muted"
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" htmlFor="from">
              <Input
                id="from"
                type="date"
                data-testid="from"
                value={range.from === "0000-01-01" ? "" : range.from}
                onChange={(event) =>
                  setCustom({ from: event.target.value, to: custom?.to ?? range.to })
                }
              />
            </Field>
            <Field label="To" htmlFor="to">
              <Input
                id="to"
                type="date"
                data-testid="to"
                value={range.to}
                onChange={(event) =>
                  setCustom({ from: custom?.from ?? range.from, to: event.target.value })
                }
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {total === 0 ? (
        <EmptyState
          icon={PieChart}
          title="Nothing spent in this period"
          description="Pick a longer period, or record an expense and it will show up here."
        />
      ) : (
        <Card className="viz">
          <CardHeader>
            <CardTitle>
              {money(total)} across {totals.length}{" "}
              {totals.length === 1 ? "category" : "categories"}
            </CardTitle>
            <CardDescription data-testid="breakdown-span">{spanLabel}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Donut
              slices={slices}
              total={total}
              money={money}
              caption={`Spending by category, ${spanLabel}. ${slices
                .map((s) => `${s.label} ${money(s.amount)}`)
                .join(", ")}.`}
            />

            {/*
              Every category, not only the five with a slice. Past about seven
              classes a chart stops being the right instrument and a table starts
              being one, so both are here; the table is the part that answers
              what exactly came seventh.
            */}
            <ul className="divide-y divide-border" data-testid="breakdown-list">
              {totals.map((row, index) => {
                const share = row.amount / total;
                const sliced = index < SLICES;
                return (
                  <li
                    key={row.categoryId ?? row.categoryName}
                    className="flex items-center gap-3 py-2"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        background: sliced ? `var(--slice-${index})` : "var(--slice-other)",
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{row.categoryName}</span>
                    <span className="tabular shrink-0 text-sm text-muted-foreground">
                      {(share * 100).toFixed(share < 0.01 ? 1 : 0)}%
                    </span>
                    <span className="tabular shrink-0 text-sm font-medium">{money(row.amount)}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
