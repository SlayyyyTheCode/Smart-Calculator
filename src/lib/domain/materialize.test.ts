import { describe, expect, it } from "vitest";

import {
  planBatch,
  planMaterialization,
  type MaterializableRule,
} from "@/lib/domain/materialize";

function rule(overrides: Partial<MaterializableRule> = {}): MaterializableRule {
  return {
    id: "rule-1",
    userId: "user-1",
    label: "Rent",
    direction: "expense",
    incomeType: null,
    expenseNature: "fixed",
    categoryId: "cat-housing",
    accountId: "acct-bank",
    amount: 250_000,
    estimatedAmount: null,
    frequency: "monthly",
    intervalCount: 1,
    dayOfMonth: null,
    startDate: "2026-01-01",
    endDate: null,
    isActive: true,
    lastMaterializedOn: null,
    ...overrides,
  };
}

describe("planMaterialization", () => {
  it("posts a fixed expense as confirmed at its real amount", () => {
    const plan = planMaterialization(rule({ lastMaterializedOn: "2026-02-01" }), "2026-03-05");

    expect(plan.transactions).toHaveLength(1);
    expect(plan.transactions[0]).toMatchObject({
      occurredOn: "2026-03-01",
      amount: 250_000,
      status: "confirmed",
      expenseNature: "fixed",
      note: "Rent",
    });
    expect(plan.lastMaterializedOn).toBe("2026-03-01");
  });

  it("posts a variable expense as a draft at its estimate", () => {
    const plan = planMaterialization(
      rule({
        label: "Electricity",
        expenseNature: "recurring",
        amount: null,
        estimatedAmount: 12_000,
        lastMaterializedOn: "2026-02-01",
      }),
      "2026-03-05",
    );

    expect(plan.transactions[0]).toMatchObject({
      amount: 12_000,
      status: "draft",
      expenseNature: "recurring",
    });
  });

  it("posts income as confirmed", () => {
    const plan = planMaterialization(
      rule({
        label: "Salary",
        direction: "income",
        incomeType: "active",
        expenseNature: null,
        amount: 800_000,
        lastMaterializedOn: "2026-02-01",
      }),
      "2026-03-05",
    );

    expect(plan.transactions[0]).toMatchObject({
      direction: "income",
      incomeType: "active",
      status: "confirmed",
      amount: 800_000,
    });
  });

  it("catches up every occurrence it missed", () => {
    const plan = planMaterialization(rule(), "2026-04-10");

    expect(plan.transactions.map((t) => t.occurredOn)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
    expect(plan.lastMaterializedOn).toBe("2026-04-01");
  });

  it("never posts ahead of today", () => {
    const plan = planMaterialization(rule({ dayOfMonth: 28 }), "2026-01-15");
    expect(plan.transactions).toHaveLength(0);
    expect(plan.skipped).toBe("up-to-date");
  });

  it("clamps a month-end rule instead of skipping February", () => {
    const plan = planMaterialization(
      rule({ startDate: "2026-01-31", lastMaterializedOn: "2026-01-31" }),
      "2026-03-31",
    );
    expect(plan.transactions.map((t) => t.occurredOn)).toEqual(["2026-02-28", "2026-03-31"]);
  });

  it("does nothing for an inactive rule", () => {
    expect(planMaterialization(rule({ isActive: false }), "2026-06-01").skipped).toBe("inactive");
  });

  it("does nothing before the rule starts", () => {
    expect(planMaterialization(rule({ startDate: "2026-09-01" }), "2026-06-01").skipped).toBe(
      "not-started",
    );
  });

  it("stops at the end date", () => {
    const plan = planMaterialization(
      rule({ endDate: "2026-03-01", lastMaterializedOn: "2026-02-01" }),
      "2026-06-01",
    );
    expect(plan.transactions.map((t) => t.occurredOn)).toEqual(["2026-03-01"]);

    const after = planMaterialization(
      rule({ endDate: "2026-03-01", lastMaterializedOn: "2026-03-01" }),
      "2026-06-01",
    );
    expect(after.transactions).toHaveLength(0);
  });

  it("refuses to guess when the amount it needs is missing", () => {
    expect(planMaterialization(rule({ amount: null }), "2026-06-01").skipped).toBe("no-amount");
    expect(
      planMaterialization(
        rule({ expenseNature: "recurring", amount: 999, estimatedAmount: null }),
        "2026-06-01",
      ).skipped,
    ).toBe("no-amount");
  });

  it("treats a zero amount as missing rather than posting nothing-entries", () => {
    expect(planMaterialization(rule({ amount: 0 }), "2026-06-01").skipped).toBe("no-amount");
  });
});

describe("planBatch", () => {
  it("resolves today per user, so a rule fires on its owner's calendar", () => {
    const rules = [
      rule({ id: "a", userId: "user-a", startDate: "2026-03-01", lastMaterializedOn: null }),
      rule({ id: "b", userId: "user-b", startDate: "2026-03-01", lastMaterializedOn: null }),
    ];

    // user-a has already ticked over to the 1st; user-b is still on the 28th.
    const plan = planBatch(rules, (userId) =>
      userId === "user-a" ? "2026-03-01" : "2026-02-28",
    );

    expect(plan.transactions).toHaveLength(1);
    expect(plan.transactions[0].userId).toBe("user-a");
    expect(plan.cursors.get("a")).toBe("2026-03-01");
    expect(plan.cursors.has("b")).toBe(false);
  });

  it("collects work across many rules", () => {
    const rules = [
      rule({ id: "a", lastMaterializedOn: "2026-02-01" }),
      rule({ id: "b", label: "Insurance", lastMaterializedOn: "2026-02-01" }),
    ];
    const plan = planBatch(rules, () => "2026-03-05");

    expect(plan.transactions).toHaveLength(2);
    expect([...plan.cursors.keys()].sort()).toEqual(["a", "b"]);
  });

  it("returns nothing when every rule is up to date", () => {
    const plan = planBatch([rule({ lastMaterializedOn: "2026-03-01" })], () => "2026-03-05");
    expect(plan.transactions).toHaveLength(0);
    expect(plan.cursors.size).toBe(0);
  });
});
