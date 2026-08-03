import { describe, expect, it } from "vitest";

import {
  extraPaymentSaving,
  payoffDate,
  projectPayoff,
  summariseDebts,
} from "@/lib/domain/debt";

describe("projectPayoff", () => {
  it("clears an interest-free debt in exactly the arithmetic number of months", () => {
    const result = projectPayoff({ balance: 100_000, apr: 0, monthlyPayment: 25_000 });
    expect(result).toMatchObject({ paysOff: true, months: 4, totalInterest: 0 });
  });

  it("takes a smaller final payment rather than overshooting", () => {
    const result = projectPayoff({ balance: 100_000, apr: 0, monthlyPayment: 30_000 });
    if (!result.paysOff) throw new Error("should pay off");

    expect(result.months).toBe(4);
    expect(result.finalPayment).toBe(10_000);
    // Four payments of 300 would be 1,200; the debt was only 1,000.
    expect(result.totalPaid).toBe(100_000);
  });

  it("charges interest on the balance actually outstanding", () => {
    // 1,000.00 at 12% APR is 1% a month, so the first month's interest is 10.00.
    const result = projectPayoff({ balance: 100_000, apr: 12, monthlyPayment: 50_000 });
    if (!result.paysOff) throw new Error("should pay off");

    expect(result.months).toBe(3);
    // 1000.00 + 10.00 - 500 = 510.00; +5.10 - 500 = 15.10; +0.15 -> 15.25.
    expect(result.totalPaid).toBe(101_525);
    expect(result.totalInterest).toBe(1_525);
    expect(result.finalPayment).toBe(1_525);
  });

  it("says plainly when a payment never clears the debt", () => {
    // 1% a month on 1,000.00 is 10.00; paying 10.00 stands still forever.
    const result = projectPayoff({ balance: 100_000, apr: 12, monthlyPayment: 1_000 });
    expect(result).toMatchObject({
      paysOff: false,
      monthlyInterest: 1_000,
      minimumViablePayment: 1_001,
    });
  });

  it("treats a payment one cent above the interest as viable", () => {
    const result = projectPayoff({ balance: 100_000, apr: 12, monthlyPayment: 1_001 });
    expect(result.paysOff).toBe(true);
  });

  it("handles a debt already cleared", () => {
    expect(projectPayoff({ balance: 0, apr: 18, monthlyPayment: 10_000 })).toMatchObject({
      paysOff: true,
      months: 0,
      totalInterest: 0,
    });
  });

  it("costs more in total at a higher rate", () => {
    const cheap = projectPayoff({ balance: 500_000, apr: 6, monthlyPayment: 50_000 });
    const dear = projectPayoff({ balance: 500_000, apr: 24, monthlyPayment: 50_000 });
    if (!cheap.paysOff || !dear.paysOff) throw new Error("both should pay off");

    expect(dear.totalInterest).toBeGreaterThan(cheap.totalInterest);
    expect(dear.months).toBeGreaterThanOrEqual(cheap.months);
  });

  it("never leaves a balance behind when it claims to have paid off", () => {
    for (const apr of [0, 3.5, 18.9, 29.99]) {
      const result = projectPayoff({ balance: 1_234_567, apr, monthlyPayment: 100_000 });
      if (!result.paysOff) continue;
      // Everything paid, less the interest, must equal the original balance.
      expect(result.totalPaid - result.totalInterest).toBe(1_234_567);
    }
  });
});

describe("payoffDate", () => {
  it("counts months from the starting month", () => {
    expect(payoffDate("2026-03-01", 10)).toBe("2027-01-01");
  });
});

describe("extraPaymentSaving", () => {
  it("reports the months and interest that paying more saves", () => {
    const terms = { balance: 500_000, apr: 18, monthlyPayment: 50_000 };
    const saving = extraPaymentSaving(terms, 25_000)!;

    expect(saving.monthsSaved).toBeGreaterThan(0);
    expect(saving.interestSaved).toBeGreaterThan(0);
  });

  it("is undefined when there is nothing extra to pay", () => {
    expect(extraPaymentSaving({ balance: 100, apr: 5, monthlyPayment: 50 }, 0)).toBeNull();
  });

  it("does not invent a saving against a debt that never clears", () => {
    // The current payment is below the monthly interest, so there is no
    // baseline to subtract from — the honest answer is not a huge number.
    const saving = extraPaymentSaving(
      { balance: 100_000, apr: 12, monthlyPayment: 500 },
      100_000,
    );
    expect(saving).toEqual({ monthsSaved: 0, interestSaved: 0 });
  });

  it("is undefined when even the larger payment never clears the debt", () => {
    expect(
      extraPaymentSaving({ balance: 100_000, apr: 12, monthlyPayment: 500 }, 100),
    ).toBeNull();
  });
});

describe("summariseDebts", () => {
  it("weights the average rate by balance, not by count", () => {
    const summary = summariseDebts([
      { remainingBalance: 900_000, minimumPayment: 50_000, apr: 3 },
      { remainingBalance: 100_000, minimumPayment: 10_000, apr: 23 },
    ]);

    expect(summary.totalOwed).toBe(1_000_000);
    expect(summary.totalMinimumPayment).toBe(60_000);
    // A small expensive card must not drag the average to 13%.
    expect(summary.averageApr).toBeCloseTo(5, 5);
  });

  it("is all zeros with no debts", () => {
    expect(summariseDebts([])).toEqual({
      totalOwed: 0,
      totalMinimumPayment: 0,
      averageApr: 0,
    });
  });
});
