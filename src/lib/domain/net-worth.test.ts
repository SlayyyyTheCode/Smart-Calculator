import { describe, expect, it } from "vitest";

import { computeNetWorth, netWorthChange } from "@/lib/domain/net-worth";

describe("computeNetWorth", () => {
  it("adds accounts and other assets, then subtracts debts", () => {
    expect(
      computeNetWorth({
        accountBalances: [250_000, 1_500_000],
        assetValues: [40_000_000],
        debtBalances: [12_000_000, 300_000],
      }),
    ).toEqual({
      cashAndAccounts: 1_750_000,
      otherAssets: 40_000_000,
      totalAssets: 41_750_000,
      totalLiabilities: 12_300_000,
      netWorth: 29_450_000,
    });
  });

  it("keeps accounts and other assets separate, so neither is counted twice", () => {
    const result = computeNetWorth({
      accountBalances: [100_000],
      assetValues: [100_000],
      debtBalances: [],
    });
    expect(result.cashAndAccounts).toBe(100_000);
    expect(result.otherAssets).toBe(100_000);
    expect(result.totalAssets).toBe(200_000);
  });

  it("goes negative when the debts are larger", () => {
    expect(
      computeNetWorth({
        accountBalances: [50_000],
        assetValues: [],
        debtBalances: [500_000],
      }).netWorth,
    ).toBe(-450_000);
  });

  it("handles an overdrawn account without special-casing it", () => {
    expect(
      computeNetWorth({
        accountBalances: [-20_000, 100_000],
        assetValues: [],
        debtBalances: [],
      }).netWorth,
    ).toBe(80_000);
  });

  it("is all zeros with nothing recorded", () => {
    expect(
      computeNetWorth({ accountBalances: [], assetValues: [], debtBalances: [] }),
    ).toMatchObject({ totalAssets: 0, totalLiabilities: 0, netWorth: 0 });
  });
});

describe("netWorthChange", () => {
  const point = (asOf: string, netWorth: number) => ({
    asOf,
    totalAssets: netWorth,
    totalLiabilities: 0,
    netWorth,
  });

  it("compares the newest snapshot with the oldest", () => {
    expect(
      netWorthChange([
        point("2026-01-01", 1_000_000),
        point("2026-02-01", 1_100_000),
        point("2026-03-01", 1_250_000),
      ]),
    ).toEqual({ absolute: 250_000, ratio: 0.25 });
  });

  it("needs two snapshots to say anything", () => {
    expect(netWorthChange([])).toBeNull();
    expect(netWorthChange([point("2026-01-01", 100)])).toBeNull();
  });

  it("reports the amount but no ratio when starting from zero or below", () => {
    expect(netWorthChange([point("2026-01-01", 0), point("2026-02-01", 500)])).toEqual({
      absolute: 500,
      ratio: null,
    });
    expect(
      netWorthChange([point("2026-01-01", -1000), point("2026-02-01", -500)]),
    ).toEqual({ absolute: 500, ratio: null });
  });
});
