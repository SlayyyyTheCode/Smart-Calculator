import { describe, expect, it } from "vitest";

import { queuedTransactionSchema, transactionSchema } from "@/lib/schemas";

/**
 * The two transaction schemas differ in exactly one field, and confusing them
 * silently multiplies money by a hundred. These tests pin the difference.
 */
describe("transactionSchema (from a form)", () => {
  it("reads the amount as major units and yields minor", () => {
    const parsed = transactionSchema.parse({
      occurredOn: "2026-08-07",
      amount: "77.77",
      direction: "expense",
      expenseNature: "daily",
    });
    expect(parsed.amount).toBe(7777);
  });

  it("accepts a thousands separator", () => {
    const parsed = transactionSchema.parse({
      occurredOn: "2026-08-07",
      amount: "1,234.50",
      direction: "expense",
      expenseNature: "daily",
    });
    expect(parsed.amount).toBe(123450);
  });
});

describe("queuedTransactionSchema (from the offline queue)", () => {
  const queued = {
    occurredOn: "2026-08-07",
    amount: 7777,
    direction: "expense" as const,
    expenseNature: "daily" as const,
    tags: [],
    clientUuid: "94282cde-4dba-4428-9c4f-5a6727dcb5d6",
  };

  it("takes the amount as already-minor units and leaves it alone", () => {
    // The regression: $77.77 queues as 7777 minor. Parsed by the form schema
    // it would become 777700 and be stored as $7,777.00.
    expect(queuedTransactionSchema.parse(queued).amount).toBe(7777);
    expect(transactionSchema.parse(queued).amount).toBe(777700);
  });

  it("refuses a fractional amount, which would mean somebody sent major units", () => {
    expect(queuedTransactionSchema.safeParse({ ...queued, amount: 77.77 }).success).toBe(false);
  });

  it("refuses zero and negative amounts", () => {
    expect(queuedTransactionSchema.safeParse({ ...queued, amount: 0 }).success).toBe(false);
    expect(queuedTransactionSchema.safeParse({ ...queued, amount: -100 }).success).toBe(false);
  });

  it("bounds the amount to what the column can hold", () => {
    expect(queuedTransactionSchema.safeParse({ ...queued, amount: 1e15 }).success).toBe(false);
  });

  it("requires a clientUuid, which is what makes a replay idempotent", () => {
    const { clientUuid: _dropped, ...withoutUuid } = queued;
    expect(queuedTransactionSchema.safeParse(withoutUuid).success).toBe(false);
  });

  it("still enforces the direction rules", () => {
    expect(
      queuedTransactionSchema.safeParse({ ...queued, expenseNature: null }).success,
    ).toBe(false);
    expect(
      queuedTransactionSchema.safeParse({
        ...queued,
        direction: "income",
        expenseNature: null,
        incomeType: "active",
      }).success,
    ).toBe(true);
  });
});
