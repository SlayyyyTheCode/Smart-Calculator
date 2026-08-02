"use client";

import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMonthLabel } from "@/lib/date";
import { formatMoney, formatMoneyCompact, toMajorNumber } from "@/lib/money";

export type TrendPoint = {
  periodMonth: string;
  expense: number;
  income: number;
};

type TrendChartProps = {
  points: TrendPoint[];
  currency: string;
  locale: string;
};

type ChartRow = {
  month: string;
  label: string;
  short: string;
  Expenses: number;
  Income: number;
};

/**
 * Income against spending, month by month.
 *
 * Two series on one axis — both are money in the same currency, so a second
 * scale would invent a relationship the data does not contain. Identity comes
 * from the legend and the labelled end points, never from colour alone.
 */
export function TrendChart({ points, currency, locale }: TrendChartProps) {
  const rows: ChartRow[] = points.map((point) => ({
    month: point.periodMonth,
    label: formatMonthLabel(point.periodMonth, locale),
    short: formatMonthLabel(point.periodMonth, locale).split(" ")[0].slice(0, 3),
    // Recharts plots numbers, so amounts are converted at the boundary only.
    Expenses: toMajorNumber(point.expense),
    Income: toMajorNumber(point.income),
  }));

  const series = [
    { key: "Income", color: "var(--chart-income)" },
    { key: "Expenses", color: "var(--chart-expense)" },
  ] as const;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 pb-3">
        {series.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            {item.key}
          </span>
        ))}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* Right margin leaves room for the end-of-line labels. */}
          <LineChart data={rows} margin={{ top: 8, right: 52, bottom: 4, left: 4 }}>
            <CartesianGrid
              vertical={false}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              strokeDasharray="0"
            />
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
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
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
                          {formatMoney(
                            Math.round(row[item.key] * 100),
                            currency,
                            locale,
                          )}
                        </span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            {series.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                stroke={item.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                // The ring is the surface colour, so the marker stays legible
                // where the two lines cross.
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                isAnimationActive={false}
              >
                {/* One label per series, on the final point only. A value on
                    every point is noise; the axis and tooltip carry the rest.
                    Text wears a text token, never the series colour. */}
                <LabelList
                  dataKey={item.key}
                  content={(props) => {
                    const { x, y, index, value } = props as {
                      x?: number;
                      y?: number;
                      index?: number;
                      value?: number;
                    };
                    if (
                      index !== rows.length - 1 ||
                      typeof x !== "number" ||
                      typeof y !== "number" ||
                      typeof value !== "number"
                    ) {
                      return null;
                    }
                    return (
                      <text
                        x={x + 8}
                        y={y + 4}
                        fontSize={11}
                        fill="var(--muted-foreground)"
                      >
                        {formatMoneyCompact(Math.round(value * 100), currency, locale)}
                      </text>
                    );
                  }}
                />
              </Line>
            ))}
          </LineChart>
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
                  Income
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Expenses
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.periodMonth} className="border-b border-border">
                  <td className="py-1.5">{formatMonthLabel(point.periodMonth, locale)}</td>
                  <td className="tabular py-1.5 text-right">
                    {formatMoney(point.income, currency, locale)}
                  </td>
                  <td className="tabular py-1.5 text-right">
                    {formatMoney(point.expense, currency, locale)}
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
