import { describe, expect, it } from "vitest";

import {
  buildImportPlan,
  detectColumns,
  parseImportAmount,
  parseImportDate,
  summarisePlan,
  type ColumnMapping,
  type ImportOptions,
} from "@/lib/import/csv";

const OPTIONS: ImportOptions = {
  dateFormat: "auto",
  signConvention: "negative-expense",
  expenseNature: "daily",
  incomeType: "active",
  categoryId: null,
  accountId: null,
};

describe("detectColumns", () => {
  it("finds the obvious headers", () => {
    expect(detectColumns(["Date", "Description", "Amount"])).toMatchObject({
      date: "Date",
      description: "Description",
      amount: "Amount",
    });
  });

  it("copes with the names banks actually use", () => {
    const detected = detectColumns(["Transaction Date", "Narrative", "Money Out", "Money In"]);
    expect(detected.date).toBe("Transaction Date");
    expect(detected.description).toBe("Narrative");
    expect(detected.debit).toBe("Money Out");
    expect(detected.credit).toBe("Money In");
  });

  it("prefers an exact match over a partial one", () => {
    expect(detectColumns(["Value Date", "Date", "Amount"]).date).toBe("Date");
  });

  it("never assigns one column to two fields", () => {
    const detected = detectColumns(["Date", "Amount"]);
    const used = Object.values(detected);
    expect(new Set(used).size).toBe(used.length);
  });

  it("returns nothing it cannot find", () => {
    expect(detectColumns(["a", "b"])).toEqual({});
  });
});

describe("parseImportDate", () => {
  it("reads ISO dates", () => {
    expect(parseImportDate("2026-03-04")).toBe("2026-03-04");
    expect(parseImportDate("2026-3-4")).toBe("2026-03-04");
  });

  it("reads named months in either order", () => {
    expect(parseImportDate("4 Mar 2026")).toBe("2026-03-04");
    expect(parseImportDate("Mar 4, 2026")).toBe("2026-03-04");
    expect(parseImportDate("04 March 2026")).toBe("2026-03-04");
  });

  it("applies the format it is told to use", () => {
    expect(parseImportDate("04/03/2026", "dmy")).toBe("2026-03-04");
    expect(parseImportDate("04/03/2026", "mdy")).toBe("2026-04-03");
  });

  it("refuses to guess when both readings are possible", () => {
    // 04/03 could be 4 March or 3 April. Guessing silently moves a
    // transaction by a month, and nobody would ever notice.
    expect(parseImportDate("04/03/2026", "auto")).toBeNull();
  });

  it("decides on its own when only one reading is possible", () => {
    expect(parseImportDate("25/03/2026", "auto")).toBe("2026-03-25");
    expect(parseImportDate("03/25/2026", "auto")).toBe("2026-03-25");
  });

  it("expands a two-digit year", () => {
    expect(parseImportDate("25/03/26", "dmy")).toBe("2026-03-25");
  });

  it("accepts dots and dashes as separators", () => {
    expect(parseImportDate("25.03.2026", "dmy")).toBe("2026-03-25");
    expect(parseImportDate("25-03-2026", "dmy")).toBe("2026-03-25");
  });

  it("rejects impossible dates rather than rolling them over", () => {
    expect(parseImportDate("2026-02-30")).toBeNull();
    expect(parseImportDate("31/02/2026", "dmy")).toBeNull();
    expect(parseImportDate("2026-13-01")).toBeNull();
  });

  it("accepts a real leap day and rejects a fake one", () => {
    expect(parseImportDate("2028-02-29")).toBe("2028-02-29");
    expect(parseImportDate("2026-02-29")).toBeNull();
  });

  it("returns null for junk", () => {
    expect(parseImportDate("")).toBeNull();
    expect(parseImportDate("n/a")).toBeNull();
  });
});

describe("parseImportAmount", () => {
  it("reads a plain amount", () => {
    expect(parseImportAmount("12.34")).toEqual({ amount: 1234, negative: false });
  });

  it("reads a leading minus as negative", () => {
    expect(parseImportAmount("-12.34")).toEqual({ amount: 1234, negative: true });
  });

  it("reads accounting parentheses as negative", () => {
    expect(parseImportAmount("(12.34)")).toEqual({ amount: 1234, negative: true });
  });

  it("reads DR and CR markers", () => {
    expect(parseImportAmount("12.34 DR")).toEqual({ amount: 1234, negative: true });
    expect(parseImportAmount("12.34 CR")).toEqual({ amount: 1234, negative: false });
  });

  it("strips thousands separators and currency symbols", () => {
    expect(parseImportAmount("S$1,234.56")).toEqual({ amount: 123456, negative: false });
    expect(parseImportAmount("USD 1,234.56")).toEqual({ amount: 123456, negative: false });
  });

  it("reads a comma decimal mark", () => {
    expect(parseImportAmount("1.234,56")).toEqual({ amount: 123456, negative: false });
    expect(parseImportAmount("12,34")).toEqual({ amount: 1234, negative: false });
  });

  it("treats an empty or zero amount as no amount", () => {
    expect(parseImportAmount("")).toBeNull();
    expect(parseImportAmount("0.00")).toBeNull();
    expect(parseImportAmount("-")).toBeNull();
  });
});

describe("buildImportPlan", () => {
  const mapping: ColumnMapping = {
    date: "Date",
    amount: "Amount",
    description: "Description",
  };

  it("splits expenses from income by sign", () => {
    const plan = buildImportPlan(
      [
        { Date: "2026-03-04", Amount: "-42.50", Description: "Kopitiam" },
        { Date: "2026-03-05", Amount: "5500.00", Description: "Salary" },
      ],
      mapping,
      OPTIONS,
    );

    expect(plan.errors).toHaveLength(0);
    expect(plan.transactions[0]).toMatchObject({
      occurredOn: "2026-03-04",
      amount: 4250,
      direction: "expense",
      expenseNature: "daily",
      incomeType: null,
      merchant: "Kopitiam",
    });
    expect(plan.transactions[1]).toMatchObject({
      amount: 550_000,
      direction: "income",
      incomeType: "active",
      expenseNature: null,
    });
  });

  it("honours the opposite sign convention", () => {
    const plan = buildImportPlan(
      [{ Date: "2026-03-04", Amount: "42.50", Description: "Kopitiam" }],
      mapping,
      { ...OPTIONS, signConvention: "positive-expense" },
    );
    expect(plan.transactions[0].direction).toBe("expense");
  });

  it("reads separate debit and credit columns", () => {
    const plan = buildImportPlan(
      [
        { Date: "2026-03-04", Out: "42.50", In: "", Description: "Kopitiam" },
        { Date: "2026-03-05", Out: "", In: "5500.00", Description: "Salary" },
      ],
      { date: "Date", debit: "Out", credit: "In", description: "Description" },
      { ...OPTIONS, signConvention: "separate-columns" },
    );

    expect(plan.transactions.map((t) => t.direction)).toEqual(["expense", "income"]);
    expect(plan.transactions[0].amount).toBe(4250);
  });

  it("flags a row with both a debit and a credit", () => {
    const plan = buildImportPlan(
      [{ Date: "2026-03-04", Out: "10.00", In: "5.00" }],
      { date: "Date", debit: "Out", credit: "In" },
      { ...OPTIONS, signConvention: "separate-columns" },
    );

    expect(plan.transactions).toHaveLength(0);
    expect(plan.errors[0]).toMatchObject({ row: 2 });
  });

  it("skips rows with no amount instead of calling them errors", () => {
    const plan = buildImportPlan(
      [
        { Date: "2026-03-04", Amount: "-10.00", Description: "Coffee" },
        { Date: "", Amount: "", Description: "" },
        { Date: "2026-03-31", Amount: "0.00", Description: "Closing balance" },
      ],
      mapping,
      OPTIONS,
    );

    expect(plan.transactions).toHaveLength(1);
    expect(plan.skipped).toBe(2);
    expect(plan.errors).toHaveLength(0);
  });

  it("reports an unreadable date against the spreadsheet row number", () => {
    const plan = buildImportPlan(
      [
        { Date: "2026-03-04", Amount: "-10.00" },
        { Date: "not a date", Amount: "-20.00" },
      ],
      mapping,
      OPTIONS,
    );

    expect(plan.transactions).toHaveLength(1);
    expect(plan.errors).toEqual([
      { row: 3, message: expect.stringContaining("Could not read") },
    ]);
  });

  it("does not repeat the description as both merchant and note", () => {
    const plan = buildImportPlan(
      [{ Date: "2026-03-04", Amount: "-10.00", Description: "Kopitiam" }],
      mapping,
      OPTIONS,
    );

    expect(plan.transactions[0].merchant).toBe("Kopitiam");
    expect(plan.transactions[0].note).toBeNull();
  });

  it("keeps both when a separate merchant column is mapped", () => {
    const plan = buildImportPlan(
      [{ Date: "2026-03-04", Amount: "-10.00", Description: "Card ending 4321", Payee: "NTUC" }],
      { ...mapping, merchant: "Payee" },
      OPTIONS,
    );

    expect(plan.transactions[0].merchant).toBe("NTUC");
    expect(plan.transactions[0].note).toBe("Card ending 4321");
  });

  it("applies the chosen defaults to every row", () => {
    const plan = buildImportPlan(
      [{ Date: "2026-03-04", Amount: "-10.00" }],
      mapping,
      { ...OPTIONS, expenseNature: "fixed", categoryId: "cat-1", accountId: "acct-1" },
    );

    expect(plan.transactions[0]).toMatchObject({
      expenseNature: "fixed",
      categoryId: "cat-1",
      accountId: "acct-1",
    });
  });
});

describe("summarisePlan", () => {
  it("totals each direction and finds the range", () => {
    const plan = buildImportPlan(
      [
        { Date: "2026-03-04", Amount: "-42.50", Description: "a" },
        { Date: "2026-01-15", Amount: "-10.00", Description: "b" },
        { Date: "2026-03-20", Amount: "5500.00", Description: "c" },
      ],
      { date: "Date", amount: "Amount", description: "Description" },
      OPTIONS,
    );

    expect(summarisePlan(plan)).toMatchObject({
      count: 3,
      expense: 5250,
      income: 550_000,
      earliest: "2026-01-15",
      latest: "2026-03-20",
      errorCount: 0,
    });
  });

  it("is all zeros for an empty plan", () => {
    expect(summarisePlan({ transactions: [], errors: [], skipped: 0 })).toMatchObject({
      count: 0,
      expense: 0,
      income: 0,
      earliest: null,
      latest: null,
    });
  });
});
