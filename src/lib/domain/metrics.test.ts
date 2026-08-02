import { describe, expect, it } from "vitest";

import {
  averageMonthlyExpense,
  buildDashboardMetrics,
  changeRatio,
  fireCoverage,
  largestExpense,
  runwayMonths,
  savingsRate,
  type CategoryTotal,
  type MonthTotals,
} from "@/lib/domain/metrics";

function month(periodMonth: string, expense: number, active: number, passive: number): MonthTotals {
  return {
    periodMonth,
    totalExpense: expense,
    totalIncome: active + passive,
    incomeActive: active,
    incomePassive: passive,
  };
}

describe("fireCoverage", () => {
  it("is the share of spending that passive income pays for", () => {
    expect(fireCoverage(30_000, 100_000)).toBe(0.3);
    expect(fireCoverage(100_000, 100_000)).toBe(1);
    expect(fireCoverage(150_000, 100_000)).toBe(1.5);
  });

  it("is undefined with no spending", () => {
    expect(fireCoverage(50_000, 0)).toBeNull();
  });
});

describe("savingsRate", () => {
  it("is the share of income left unspent", () => {
    expect(savingsRate(500_000, 400_000)).toBeCloseTo(0.2);
  });

  it("goes negative when you outspend your income", () => {
    expect(savingsRate(100_000, 150_000)).toBeCloseTo(-0.5);
  });

  it("is undefined with no income", () => {
    expect(savingsRate(0, 100_000)).toBeNull();
  });
});

describe("runwayMonths", () => {
  it("divides cash by the burn rate", () => {
    expect(runwayMonths(600_000, 200_000)).toBe(3);
  });

  it("is zero when there is nothing left", () => {
    expect(runwayMonths(0, 200_000)).toBe(0);
    expect(runwayMonths(-500, 200_000)).toBe(0);
  });

  it("is undefined with no burn rate to divide by", () => {
    expect(runwayMonths(600_000, 0)).toBeNull();
  });
});

describe("averageMonthlyExpense", () => {
  it("averages only the months that had spending", () => {
    const months = [
      month("2026-01-01", 100_000, 0, 0),
      month("2026-02-01", 0, 0, 0),
      month("2026-03-01", 200_000, 0, 0),
    ];
    expect(averageMonthlyExpense(months)).toBe(150_000);
  });

  it("is zero with nothing to average", () => {
    expect(averageMonthlyExpense([])).toBe(0);
  });
});

describe("largestExpense", () => {
  const current: CategoryTotal[] = [
    { categoryId: "a", categoryName: "Groceries", amount: 40_000 },
    { categoryId: "b", categoryName: "Housing", amount: 120_000 },
    { categoryId: "c", categoryName: "Transport", amount: 40_000 },
  ];

  it("finds the top category and its share of the month", () => {
    const result = largestExpense(current)!;
    expect(result.category.categoryName).toBe("Housing");
    expect(result.share).toBeCloseTo(0.6);
  });

  it("compares against the same category last month", () => {
    const previous: CategoryTotal[] = [
      { categoryId: "b", categoryName: "Housing", amount: 100_000 },
    ];
    expect(largestExpense(current, previous)!.changeVsPrevious).toBeCloseTo(0.2);
  });

  it("has no comparison when the category is new", () => {
    expect(largestExpense(current, [])!.changeVsPrevious).toBeNull();
  });

  it("is null when nothing was spent", () => {
    expect(largestExpense([])).toBeNull();
    expect(largestExpense([{ categoryId: "a", categoryName: "Groceries", amount: 0 }])).toBeNull();
  });
});

describe("changeRatio", () => {
  it("is undefined without a base to compare to", () => {
    expect(changeRatio(100, 0)).toBeNull();
  });

  it("reports growth and decline", () => {
    expect(changeRatio(150, 100)).toBeCloseTo(0.5);
    expect(changeRatio(50, 100)).toBeCloseTo(-0.5);
  });
});

describe("buildDashboardMetrics", () => {
  it("rolls a month up into the dashboard tiles", () => {
    const current = month("2026-03-01", 300_000, 500_000, 90_000);
    const previous = month("2026-02-01", 250_000, 500_000, 80_000);

    const metrics = buildDashboardMetrics(current, previous, [previous, current], 900_000);

    expect(metrics.netCashflow).toBe(290_000);
    expect(metrics.savingsRate).toBeCloseTo(0.4915, 3);
    expect(metrics.fireCoverage).toBeCloseTo(0.3);
    expect(metrics.runwayMonths).toBeCloseTo(900_000 / 275_000);
    expect(metrics.expenseChange).toBeCloseTo(0.2);
  });

  it("copes with no prior month", () => {
    const current = month("2026-03-01", 300_000, 500_000, 0);
    expect(buildDashboardMetrics(current, undefined, [current], 0).expenseChange).toBeNull();
  });
});
