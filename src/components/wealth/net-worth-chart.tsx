"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDateLabel } from "@/lib/date";
import type { NetWorthPoint } from "@/lib/domain/net-worth";
import { formatMoney, formatMoneyCompact, toMajorNumber } from "@/lib/money";

type NetWorthChartProps = {
  points: NetWorthPoint[];
  currency: string;
  locale: string;
};

/**
 * Net worth over time.
 *
 * One series, so no legend — the card title already says what is plotted. An
 * area rather than a line because the distance from zero is the point, and a
 * marked zero line because crossing it is the thing that matters.
 */
export function NetWorthChart({ points, currency, locale }: NetWorthChartProps) {
  const rows = points.map((point) => ({
    label: formatDateLabel(point.asOf, locale),
    short: point.asOf.slice(0, 7),
    value: toMajorNumber(point.netWorth),
    assets: toMajorNumber(point.totalAssets),
    liabilities: toMajorNumber(point.totalLiabilities),
  }));

  const anyNegative = rows.some((row) => row.value < 0);

  return (
    <div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                {/* A wash, never a saturated block. */}
                <stop offset="0%" stopColor="var(--chart-income)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--chart-income)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="0" />
            <XAxis
              dataKey="short"
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
              tickFormatter={(value: number) =>
                formatMoneyCompact(Math.round(value * 100), currency, locale)
              }
            />
            {anyNegative ? (
              <ReferenceLine y={0} stroke="var(--chart-axis)" strokeWidth={1} />
            ) : null}
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof rows)[number];
                return (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
                    <p className="pb-1 font-medium">{row.label}</p>
                    <p className="flex gap-3">
                      <span className="text-muted-foreground">Assets</span>
                      <span className="tabular ml-auto">
                        {formatMoney(Math.round(row.assets * 100), currency, locale)}
                      </span>
                    </p>
                    <p className="flex gap-3">
                      <span className="text-muted-foreground">Liabilities</span>
                      <span className="tabular ml-auto">
                        {formatMoney(Math.round(row.liabilities * 100), currency, locale)}
                      </span>
                    </p>
                    <p className="flex gap-3 border-t border-border pt-1 font-medium">
                      <span>Net</span>
                      <span className="tabular ml-auto">
                        {formatMoney(Math.round(row.value * 100), currency, locale)}
                      </span>
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--chart-income)"
              strokeWidth={2}
              fill="url(#netWorthFill)"
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <details className="pt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">View as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1.5 font-medium">Date</th>
                <th scope="col" className="py-1.5 text-right font-medium">Assets</th>
                <th scope="col" className="py-1.5 text-right font-medium">Liabilities</th>
                <th scope="col" className="py-1.5 text-right font-medium">Net worth</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.asOf} className="border-b border-border">
                  <td className="py-1.5">{formatDateLabel(point.asOf, locale)}</td>
                  <td className="tabular py-1.5 text-right">
                    {formatMoney(point.totalAssets, currency, locale)}
                  </td>
                  <td className="tabular py-1.5 text-right">
                    {formatMoney(point.totalLiabilities, currency, locale)}
                  </td>
                  <td className="tabular py-1.5 text-right font-medium">
                    {formatMoney(point.netWorth, currency, locale)}
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
