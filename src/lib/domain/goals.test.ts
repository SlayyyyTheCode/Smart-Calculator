import { describe, expect, it } from "vitest";

import { goalProgress, summariseGoals } from "@/lib/domain/goals";

const TODAY = "2026-03-15";

describe("goalProgress", () => {
  it("reports the monthly amount needed to arrive on time", () => {
    const progress = goalProgress(
      { targetAmount: 1_200_000, currentAmount: 200_000, targetDate: "2026-09-15" },
      TODAY,
    );

    expect(progress.monthsRemaining).toBe(6);
    expect(progress.remaining).toBe(1_000_000);
    // 10,000.00 over six months.
    expect(progress.requiredMonthly).toBe(166_667);
    expect(progress.status).toBe("on-schedule");
  });

  it("rounds the monthly figure up, so the target is actually reached", () => {
    const progress = goalProgress(
      { targetAmount: 10_000, currentAmount: 0, targetDate: "2026-06-15" },
      TODAY,
    );
    // 100.00 over three months is 33.3333 each; setting aside 33.33 would
    // land a cent short, so the figure rounds up.
    expect(progress.monthsRemaining).toBe(3);
    expect(progress.requiredMonthly).toBe(3_334);
  });

  it("counts a target later in the same month as a month to save in", () => {
    expect(
      goalProgress(
        { targetAmount: 1000, currentAmount: 0, targetDate: "2026-04-20" },
        TODAY,
      ).monthsRemaining,
    ).toBe(1);

    // Earlier in the month means that month has already slipped away.
    expect(
      goalProgress(
        { targetAmount: 1000, currentAmount: 0, targetDate: "2026-04-10" },
        TODAY,
      ).monthsRemaining,
    ).toBe(0);
  });

  it("asks for the whole remainder when no whole months are left", () => {
    const progress = goalProgress(
      { targetAmount: 50_000, currentAmount: 20_000, targetDate: "2026-03-28" },
      TODAY,
    );
    expect(progress.monthsRemaining).toBe(0);
    expect(progress.requiredMonthly).toBe(30_000);
  });

  it("is complete once the target is reached, however it was flagged", () => {
    expect(
      goalProgress({ targetAmount: 50_000, currentAmount: 50_000 }, TODAY).status,
    ).toBe("complete");
    expect(
      goalProgress({ targetAmount: 50_000, currentAmount: 10_000, isCompleted: true }, TODAY)
        .status,
    ).toBe("complete");
  });

  it("never reports more than finished, even when overfunded", () => {
    const progress = goalProgress({ targetAmount: 50_000, currentAmount: 80_000 }, TODAY);
    expect(progress.ratio).toBe(1);
    expect(progress.remaining).toBe(0);
  });

  it("flags a target date that has passed", () => {
    const progress = goalProgress(
      { targetAmount: 50_000, currentAmount: 10_000, targetDate: "2026-01-01" },
      TODAY,
    );
    expect(progress.status).toBe("overdue");
    expect(progress.requiredMonthly).toBe(40_000);
  });

  it("has no monthly figure without a deadline", () => {
    const progress = goalProgress({ targetAmount: 50_000, currentAmount: 10_000 }, TODAY);
    expect(progress.status).toBe("no-deadline");
    expect(progress.requiredMonthly).toBeNull();
    expect(progress.ratio).toBeCloseTo(0.2);
  });

  it("does not divide by a zero target", () => {
    expect(goalProgress({ targetAmount: 0, currentAmount: 0 }, TODAY).ratio).toBe(1);
  });
});

describe("summariseGoals", () => {
  it("totals what is saved and what must be set aside each month", () => {
    const summary = summariseGoals(
      [
        { targetAmount: 600_000, currentAmount: 300_000, targetDate: "2026-06-15" },
        { targetAmount: 100_000, currentAmount: 100_000 },
        { targetAmount: 200_000, currentAmount: 0 },
      ],
      TODAY,
    );

    expect(summary.count).toBe(3);
    expect(summary.completed).toBe(1);
    expect(summary.targetTotal).toBe(900_000);
    expect(summary.savedTotal).toBe(400_000);
    // Only the goal with a deadline contributes a monthly requirement.
    expect(summary.monthlyTotal).toBe(100_000);
  });

  it("never counts more than the target as saved", () => {
    const summary = summariseGoals([{ targetAmount: 50_000, currentAmount: 90_000 }], TODAY);
    expect(summary.savedTotal).toBe(50_000);
  });
});
