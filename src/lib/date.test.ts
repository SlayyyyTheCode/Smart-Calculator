import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  compareIsoDates,
  daysInMonth,
  endOfMonth,
  lastNMonths,
  parseIsoDate,
  startOfMonth,
  todayIso,
} from "@/lib/date";

describe("parseIsoDate", () => {
  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(() => parseIsoDate("2026-3-1")).toThrow();
    expect(() => parseIsoDate("01/03/2026")).toThrow();
  });
});

describe("daysInMonth", () => {
  it("knows month lengths, including leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("addMonths", () => {
  it("clamps to the end of a shorter month instead of overflowing", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("crosses year boundaries in both directions", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonths("2026-01-15", -13)).toBe("2024-12-15");
  });
});

describe("addDays", () => {
  it("steps across month and year ends", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("startOfMonth / endOfMonth", () => {
  it("matches what date_trunc('month', ...) produces in SQL", () => {
    expect(startOfMonth("2026-07-17")).toBe("2026-07-01");
    expect(endOfMonth("2026-02-17")).toBe("2026-02-28");
    expect(endOfMonth("2028-02-01")).toBe("2028-02-29");
  });
});

describe("compareIsoDates", () => {
  it("orders chronologically", () => {
    expect(compareIsoDates("2026-01-01", "2026-02-01")).toBeLessThan(0);
    expect(compareIsoDates("2026-02-01", "2026-01-01")).toBeGreaterThan(0);
    expect(compareIsoDates("2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("lastNMonths", () => {
  it("returns the window oldest first, ending on the given month", () => {
    expect(lastNMonths("2026-03-15", 3)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});

describe("todayIso", () => {
  it("reports the calendar date in the requested zone", () => {
    // 2026-01-01T02:00Z is still 2025-12-31 in New York.
    const instant = new Date("2026-01-01T02:00:00Z");
    expect(todayIso("UTC", instant)).toBe("2026-01-01");
    expect(todayIso("America/New_York", instant)).toBe("2025-12-31");
  });
});
