import { describe, expect, it } from "vitest";

import {
  formatMoney,
  parseAmount,
  scaleMinor,
  sumMinor,
  toMajorNumber,
  toMajorString,
  toMinor,
} from "@/lib/money";

describe("parseAmount", () => {
  it("reads plain decimals as minor units", () => {
    expect(parseAmount("12.34")).toBe(1234);
    expect(parseAmount("0.05")).toBe(5);
    expect(parseAmount("100")).toBe(10000);
  });

  it("pads a single decimal place", () => {
    expect(parseAmount("12.3")).toBe(1230);
  });

  it("ignores thousands separators and whitespace", () => {
    expect(parseAmount(" 1,234.50 ")).toBe(123450);
  });

  it("rounds anything more precise than a cent", () => {
    expect(parseAmount("1.005")).toBe(101);
    expect(parseAmount("1.004")).toBe(100);
  });

  it("handles the classic float trap exactly", () => {
    expect(sumMinor([parseAmount("0.1")!, parseAmount("0.2")!])).toBe(30);
    expect(toMajorString(sumMinor([parseAmount("0.1")!, parseAmount("0.2")!]))).toBe("0.30");
  });

  it("accepts negatives", () => {
    expect(parseAmount("-4.20")).toBe(-420);
  });

  it("rejects anything that is not an amount", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.2.3")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});

describe("toMinor", () => {
  it("throws rather than yielding NaN", () => {
    expect(() => toMinor("not money")).toThrow();
  });
});

describe("toMajorString", () => {
  it("always emits two decimal places", () => {
    expect(toMajorString(5)).toBe("0.05");
    expect(toMajorString(1200)).toBe("12.00");
    expect(toMajorString(-1234)).toBe("-12.34");
  });

  it("round-trips through parseAmount", () => {
    for (const minor of [0, 1, 99, 100, 123456, -750]) {
      expect(parseAmount(toMajorString(minor))).toBe(minor);
    }
  });
});

describe("toMajorNumber", () => {
  it("converts back to a decimal number", () => {
    expect(toMajorNumber(1234)).toBe(12.34);
  });
});

describe("scaleMinor", () => {
  it("rounds to the nearest minor unit", () => {
    expect(scaleMinor(1000, 0.333)).toBe(333);
    expect(scaleMinor(101, 0.5)).toBe(51);
  });
});

describe("formatMoney", () => {
  it("formats in the requested currency", () => {
    expect(formatMoney(123456, "USD", "en-US")).toBe("$1,234.56");
  });
});
