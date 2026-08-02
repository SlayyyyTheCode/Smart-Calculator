"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMonthLabel } from "@/lib/date";
import { formatMoney, formatMoneyCompact, toMajorNumber } from "@/lib/money";

export type IncomeSplitPoint = {
  periodMonth: string;
  active: number;
  passive: number;
};

type IncomeSplitChartProps = {
  points: IncomeSplitPoint[];
  currency: string;
  locale: string;
};

type ChartRow = {
  label: string;
  short: string;
  Active: number;
  Passive: number;
};

/**
 * Active against passive income, stacked because together they are your total
 * income — a part-to-whole reading is the point. The 2px gap between the two
 * segments is drawn in the surface colour rather than as a stroke around each.
 */
export function IncomeSplitChart({ points, currency, locale }: IncomeSplitChartProps) {
  const rows: ChartRow[] = points.map((point) => ({
    label: formatMonthLabel(point.periodMonth, locale),
    short: formatMonthLabel(point.periodMonth, locale).split(" ")[0].slice(0, 3),
    Active: toMajorNumber(point.active),
    Passive: toMajorNumber(point.passive),
  }));

  const series = [
    { key: "Active", color: "var(--chart-income)" },
    { key: "Passive", color: "var(--chart-expense)" },
  ] as const;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 pb-3">
        {series.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            {item.key}
          </span>
        ))}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="0" />
            <XAxis
              dataKey="short"
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
              tickFormatter={(value: number) =>
                formatMoneyCompact(Math.round(value * 100), currency, locale)
              }
            />
            <Tooltip
              cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as ChartRow;
                return (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
                    <p className="pb-1 font-medium">{row.label}</p>
                    {series.map((item) => (
                      <p key={item.key} className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: item.color }}
                          aria-hidden
                        />
                        <span className="text-muted-foreground">{item.key}</span>
                        <span className="tabular ml-auto font-medium">
                          {formatMoney(Math.round(row[item.key] * 100), currency, locale)}
                        </span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            {/* stackId puts them in one column; the surface-coloured stroke is
                the 2px gap that keeps the segments distinct. */}
            {/* Animation off: a dashboard that regrows its bars on every
                render is motion without information. */}
            <Bar
              dataKey="Active"
              stackId="income"
              fill="var(--chart-income)"
              maxBarSize={24}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Bar
              dataKey="Passive"
              stackId="income"
              fill="var(--chart-expense)"
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="pt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">View as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-sm text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1.5 font-medium">
                  Month
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Active
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Passive
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.periodMonth} className="border-b border-border">
                  <td className="py-1.5">{formatMonthLabel(point.periodMonth, locale)}</td>
                  <td className="tabular py-1.5 text-right">
                    {formatMoney(point.active, currency, locale)}
                  </td>
                  <td className="tabular py-1.5 text-right">
                    {formatMoney(point.passive, currency, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
