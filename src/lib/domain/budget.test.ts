import { describe, expect, it } from "vitest";

import { byUrgency, describeBudget, evaluateBudget } from "@/lib/domain/budget";

const LIMIT = 100_000; // 1,000.00

describe("evaluateBudget", () => {
  it("stays green below the warning threshold", () => {
    expect(evaluateBudget({ spent: 79_000, limit: LIMIT }).level).toBe("ok");
  });

  it("turns amber exactly at the threshold", () => {
    expect(evaluateBudget({ spent: 80_000, limit: LIMIT }).level).toBe("warning");
  });

  it("stays amber right up to the limit", () => {
    expect(evaluateBudget({ spent: 99_900, limit: LIMIT }).level).toBe("warning");
  });

  it("turns red exactly at the limit", () => {
    expect(evaluateBudget({ spent: 100_000, limit: LIMIT }).level).toBe("exceeded");
  });

  it("stays red beyond the limit", () => {
    expect(evaluateBudget({ spent: 101_000, limit: LIMIT }).level).toBe("exceeded");
  });

  it("honours a custom threshold", () => {
    expect(evaluateBudget({ spent: 55_000, limit: LIMIT, warnThresholdPct: 50 }).level).toBe(
      "warning",
    );
    expect(evaluateBudget({ spent: 55_000, limit: LIMIT, warnThresholdPct: 90 }).level).toBe("ok");
  });

  it("reports percentage, remaining and overspend", () => {
    const under = evaluateBudget({ spent: 25_000, limit: LIMIT });
    expect(under.pctUsed).toBe(25);
    expect(under.remaining).toBe(75_000);
    expect(under.overspend).toBe(0);

    const over = evaluateBudget({ spent: 120_000, limit: LIMIT });
    expect(over.pctUsed).toBe(120);
    expect(over.remaining).toBe(-20_000);
    expect(over.overspend).toBe(20_000);
  });

  it("treats any spend against a zero limit as exceeded", () => {
    expect(evaluateBudget({ spent: 1, limit: 0 }).level).toBe("exceeded");
    expect(evaluateBudget({ spent: 0, limit: 0 }).level).toBe("ok");
  });

  it("clamps a nonsense threshold rather than misclassifying", () => {
    expect(evaluateBudget({ spent: 0, limit: LIMIT, warnThresholdPct: 0 }).warnThresholdPct).toBe(1);
    expect(
      evaluateBudget({ spent: 0, limit: LIMIT, warnThresholdPct: 250 }).warnThresholdPct,
    ).toBe(100);
    expect(
      evaluateBudget({ spent: 0, limit: LIMIT, warnThresholdPct: Number.NaN }).warnThresholdPct,
    ).toBe(80);
  });
});

describe("describeBudget", () => {
  it("labels each level", () => {
    expect(describeBudget(evaluateBudget({ spent: 10, limit: LIMIT }))).toBe("On track");
    expect(describeBudget(evaluateBudget({ spent: 85_000, limit: LIMIT }))).toBe("Close to limit");
    expect(describeBudget(evaluateBudget({ spent: 150_000, limit: LIMIT }))).toBe("Exceeded");
  });
});

describe("byUrgency", () => {
  it("puts exceeded first, then warnings, then the rest", () => {
    const ok = evaluateBudget({ spent: 10_000, limit: LIMIT });
    const warning = evaluateBudget({ spent: 85_000, limit: LIMIT });
    const exceeded = evaluateBudget({ spent: 150_000, limit: LIMIT });

    expect([ok, exceeded, warning].sort(byUrgency).map((b) => b.level)).toEqual([
      "exceeded",
      "warning",
      "ok",
    ]);
  });
});
