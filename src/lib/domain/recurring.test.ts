import { describe, expect, it } from "vitest";

import {
  describeRecurrence,
  dueOccurrences,
  nextOccurrence,
  occurrenceAt,
  occurrencesBetween,
  type RecurrenceSpec,
} from "@/lib/domain/recurring";

const monthly = (overrides: Partial<RecurrenceSpec> = {}): RecurrenceSpec => ({
  frequency: "monthly",
  intervalCount: 1,
  startDate: "2026-01-15",
  ...overrides,
});

describe("occurrenceAt", () => {
  it("steps monthly from the anchor", () => {
    const spec = monthly();
    expect(occurrenceAt(spec, 0)).toBe("2026-01-15");
    expect(occurrenceAt(spec, 1)).toBe("2026-02-15");
    expect(occurrenceAt(spec, 12)).toBe("2027-01-15");
  });

  it("clamps a month-end anchor without drifting permanently", () => {
    // The whole point of anchoring: February shortens, March does not stay short.
    const spec = monthly({ startDate: "2026-01-31" });
    expect(occurrenceAt(spec, 0)).toBe("2026-01-31");
    expect(occurrenceAt(spec, 1)).toBe("2026-02-28");
    expect(occurrenceAt(spec, 2)).toBe("2026-03-31");
    expect(occurrenceAt(spec, 3)).toBe("2026-04-30");
  });

  it("uses dayOfMonth in preference to the start date's day", () => {
    const spec = monthly({ startDate: "2026-01-05", dayOfMonth: 28 });
    expect(occurrenceAt(spec, 0)).toBe("2026-01-28");
    expect(occurrenceAt(spec, 1)).toBe("2026-02-28");
  });

  it("handles a 31st anchor in a leap February", () => {
    const spec = monthly({ startDate: "2028-01-31" });
    expect(occurrenceAt(spec, 1)).toBe("2028-02-29");
  });

  it("steps by the interval", () => {
    const spec = monthly({ intervalCount: 3 });
    expect(occurrenceAt(spec, 1)).toBe("2026-04-15");
  });

  it("handles quarterly and yearly", () => {
    expect(occurrenceAt(monthly({ frequency: "quarterly" }), 2)).toBe("2026-07-15");
    expect(occurrenceAt(monthly({ frequency: "yearly" }), 2)).toBe("2028-01-15");
  });

  it("handles weekly by whole days", () => {
    const spec = monthly({ frequency: "weekly", startDate: "2026-01-01" });
    expect(occurrenceAt(spec, 1)).toBe("2026-01-08");
    expect(occurrenceAt(spec, 5)).toBe("2026-02-05");
  });

  it("treats a nonsense interval as 1 rather than looping forever", () => {
    expect(occurrenceAt(monthly({ intervalCount: 0 }), 2)).toBe("2026-03-15");
  });
});

describe("occurrencesBetween", () => {
  it("returns the window inclusive of both ends", () => {
    expect(occurrencesBetween(monthly(), "2026-02-01", "2026-04-30")).toEqual([
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("never produces anything before the rule starts", () => {
    expect(occurrencesBetween(monthly(), "2025-01-01", "2026-02-28")).toEqual([
      "2026-01-15",
      "2026-02-15",
    ]);
  });

  it("stops at the rule's end date", () => {
    const spec = monthly({ endDate: "2026-03-01" });
    expect(occurrencesBetween(spec, "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-15",
      "2026-02-15",
    ]);
  });

  it("is empty when the window ends before the rule begins", () => {
    expect(occurrencesBetween(monthly(), "2025-01-01", "2025-06-01")).toEqual([]);
  });
});

describe("nextOccurrence", () => {
  it("finds the first date on or after the given day", () => {
    expect(nextOccurrence(monthly(), "2026-02-16")).toBe("2026-03-15");
    expect(nextOccurrence(monthly(), "2026-02-15")).toBe("2026-02-15");
  });

  it("is null once the rule has ended", () => {
    expect(nextOccurrence(monthly({ endDate: "2026-02-20" }), "2026-03-01")).toBeNull();
  });
});

describe("dueOccurrences", () => {
  it("catches up everything not yet posted", () => {
    expect(dueOccurrences(monthly(), "2026-04-20", "2026-02-15")).toEqual([
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("starts from the rule's start date when nothing has been posted", () => {
    expect(dueOccurrences(monthly(), "2026-02-20", null)).toEqual(["2026-01-15", "2026-02-15"]);
  });

  it("owes nothing when already up to date", () => {
    expect(dueOccurrences(monthly(), "2026-02-20", "2026-02-15")).toEqual([]);
  });

  it("never posts ahead of today", () => {
    expect(dueOccurrences(monthly(), "2026-01-14", null)).toEqual([]);
  });
});

describe("describeRecurrence", () => {
  it("reads as a sentence", () => {
    expect(describeRecurrence(monthly())).toBe("Every month on the 15th");
    expect(describeRecurrence(monthly({ intervalCount: 2 }))).toBe("Every 2 months on the 15th");
    expect(describeRecurrence(monthly({ startDate: "2026-01-01" }))).toBe("Every month on the 1st");
    expect(describeRecurrence(monthly({ startDate: "2026-01-02" }))).toBe("Every month on the 2nd");
    expect(describeRecurrence(monthly({ startDate: "2026-01-03" }))).toBe("Every month on the 3rd");
    expect(describeRecurrence(monthly({ startDate: "2026-01-11" }))).toBe("Every month on the 11th");
    expect(describeRecurrence(monthly({ frequency: "weekly" }))).toBe("Every week");
    expect(describeRecurrence(monthly({ frequency: "quarterly" }))).toBe(
      "Every quarter on the 15th",
    );
  });
});
