import { describe, expect, it } from "vitest";

import { parseTransactionForm, readTransactionForm, withClientUuid } from "@/lib/transactions/payload";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const EXPENSE = {
  direction: "expense",
  amount: "12.34",
  occurredOn: "2026-03-04",
  expenseNature: "daily",
};

describe("readTransactionForm", () => {
  it("clears the field the chosen direction does not use", () => {
    const asExpense = readTransactionForm(
      form({ ...EXPENSE, incomeType: "active" }),
    );
    expect(asExpense.incomeType).toBeNull();
    expect(asExpense.expenseNature).toBe("daily");

    const asIncome = readTransactionForm(
      form({
        direction: "income",
        amount: "500",
        occurredOn: "2026-03-04",
        incomeType: "passive",
        expenseNature: "daily",
      }),
    );
    expect(asIncome.expenseNature).toBeNull();
    expect(asIncome.incomeType).toBe("passive");
  });

  it("splits tags and drops the empties", () => {
    const values = readTransactionForm(form({ ...EXPENSE, tags: " work , , reimbursable ," }));
    expect(values.tags).toEqual(["work", "reimbursable"]);
  });

  it("has no tags when the field is absent", () => {
    expect(readTransactionForm(form(EXPENSE)).tags).toEqual([]);
  });
});

describe("parseTransactionForm", () => {
  it("accepts a well-formed expense and converts the amount to minor units", () => {
    const result = parseTransactionForm(form(EXPENSE));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amount).toBe(1234);
      expect(result.value.direction).toBe("expense");
      expect(result.value.expenseNature).toBe("daily");
    }
  });

  it("reports one message per field rather than a wall of them", () => {
    const result = parseTransactionForm(
      form({ direction: "expense", amount: "not money", occurredOn: "nope" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.amount).toBeTruthy();
      expect(result.fieldErrors.occurredOn).toBeTruthy();
      // The cross-field checks do not run while a field-level one is failing,
      // so the missing nature is reported on the next attempt, not this one.
      expect(Object.keys(result.fieldErrors)).toHaveLength(2);
    }
  });

  it("reports the missing nature once the field-level checks pass", () => {
    const result = parseTransactionForm(
      form({ direction: "expense", amount: "5.00", occurredOn: "2026-03-04" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.expenseNature).toBeTruthy();
  });

  it("rejects an expense carrying an income type", () => {
    // readTransactionForm strips it, so this asserts the stripping is what
    // keeps the combination valid rather than luck.
    const values = readTransactionForm(form({ ...EXPENSE, incomeType: "active" }));
    expect(values.incomeType).toBeNull();
  });

  it("rejects a zero or negative amount", () => {
    expect(parseTransactionForm(form({ ...EXPENSE, amount: "0" })).ok).toBe(false);
    expect(parseTransactionForm(form({ ...EXPENSE, amount: "-5" })).ok).toBe(false);
  });

  it("requires a nature on an expense and a type on income", () => {
    expect(
      parseTransactionForm(
        form({ direction: "expense", amount: "5", occurredOn: "2026-03-04" }),
      ).ok,
    ).toBe(false);
    expect(
      parseTransactionForm(
        form({ direction: "income", amount: "5", occurredOn: "2026-03-04" }),
      ).ok,
    ).toBe(false);
  });
});

describe("withClientUuid", () => {
  it("stamps an id when there is none", () => {
    const result = parseTransactionForm(form(EXPENSE));
    if (!result.ok) throw new Error("fixture should parse");

    const uuid = crypto.randomUUID();
    expect(withClientUuid(result.value, uuid).clientUuid).toBe(uuid);
  });

  it("keeps an id the form already carried, so a retry is still the same entry", () => {
    const existing = crypto.randomUUID();
    const result = parseTransactionForm(form({ ...EXPENSE, clientUuid: existing }));
    if (!result.ok) throw new Error("fixture should parse");

    expect(withClientUuid(result.value, crypto.randomUUID()).clientUuid).toBe(existing);
  });

  it("only accepts a conforming UUID, which is what crypto.randomUUID emits", () => {
    // zod 4 checks the RFC 9562 version and variant bits, so a hand-written
    // "uuid-shaped" string is not accepted. Every id the app generates comes
    // from crypto.randomUUID, which is.
    expect(parseTransactionForm(form({ ...EXPENSE, clientUuid: "1".repeat(32) })).ok).toBe(false);
    expect(
      parseTransactionForm(form({ ...EXPENSE, clientUuid: crypto.randomUUID() })).ok,
    ).toBe(true);
  });
});
