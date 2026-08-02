import { describe, expect, it } from "vitest";

import {
  filtersToSearchParams,
  hasActiveFilters,
  parseTransactionFilters,
} from "@/lib/data/transaction-filters";

const TODAY = "2026-08-02";

describe("parseTransactionFilters", () => {
  it("defaults to the current month, both directions, confirmed only", () => {
    const filters = parseTransactionFilters({}, TODAY);
    expect(filters).toEqual({
      month: "2026-08-01",
      direction: "all",
      nature: "all",
      incomeType: "all",
      categoryId: null,
      accountId: null,
      search: null,
      status: "confirmed",
      page: 1,
    });
  });

  it("normalises any date in a month to that month's start", () => {
    expect(parseTransactionFilters({ month: "2026-03-17" }, TODAY).month).toBe("2026-03-01");
  });

  it("understands month=all", () => {
    expect(parseTransactionFilters({ month: "all" }, TODAY).month).toBeNull();
  });

  it("falls back to this month for a malformed date", () => {
    expect(parseTransactionFilters({ month: "March" }, TODAY).month).toBe("2026-08-01");
    expect(parseTransactionFilters({ month: "2026-3-1" }, TODAY).month).toBe("2026-08-01");
  });

  it("only accepts known enum values", () => {
    const filters = parseTransactionFilters(
      { direction: "sideways", nature: "occasional", status: "maybe" },
      TODAY,
    );
    expect(filters.direction).toBe("all");
    expect(filters.nature).toBe("all");
    expect(filters.status).toBe("confirmed");
  });

  it("keeps valid enum values", () => {
    const filters = parseTransactionFilters(
      { direction: "expense", nature: "fixed", incomeType: "passive", status: "draft" },
      TODAY,
    );
    expect(filters.direction).toBe("expense");
    expect(filters.nature).toBe("fixed");
    expect(filters.incomeType).toBe("passive");
    expect(filters.status).toBe("draft");
  });

  it("rejects anything that is not a uuid for id filters", () => {
    const good = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(parseTransactionFilters({ category: good }, TODAY).categoryId).toBe(good);
    expect(parseTransactionFilters({ category: "'; drop table" }, TODAY).categoryId).toBeNull();
    expect(parseTransactionFilters({ account: "42" }, TODAY).accountId).toBeNull();
  });

  it("trims and caps the search term", () => {
    expect(parseTransactionFilters({ q: "  coffee  " }, TODAY).search).toBe("coffee");
    expect(parseTransactionFilters({ q: "   " }, TODAY).search).toBeNull();
    expect(parseTransactionFilters({ q: "x".repeat(500) }, TODAY).search).toHaveLength(100);
  });

  it("ignores a nonsense page number", () => {
    expect(parseTransactionFilters({ page: "3" }, TODAY).page).toBe(3);
    expect(parseTransactionFilters({ page: "0" }, TODAY).page).toBe(1);
    expect(parseTransactionFilters({ page: "-2" }, TODAY).page).toBe(1);
    expect(parseTransactionFilters({ page: "two" }, TODAY).page).toBe(1);
  });

  it("takes the first value when a param is repeated", () => {
    expect(parseTransactionFilters({ direction: ["income", "expense"] }, TODAY).direction).toBe(
      "income",
    );
  });
});

describe("filtersToSearchParams", () => {
  it("omits defaults so the URL stays short", () => {
    const filters = parseTransactionFilters({}, TODAY);
    expect(filtersToSearchParams(filters).toString()).toBe("month=2026-08-01");
  });

  it("round-trips a fully specified filter set", () => {
    const original = parseTransactionFilters(
      {
        month: "2026-05-01",
        direction: "expense",
        nature: "fixed",
        status: "all",
        q: "rent",
        page: "2",
      },
      TODAY,
    );
    const roundTripped = parseTransactionFilters(
      Object.fromEntries(filtersToSearchParams(original)),
      TODAY,
    );
    expect(roundTripped).toEqual(original);
  });

  it("serialises all-time as month=all", () => {
    expect(filtersToSearchParams({ month: null }).get("month")).toBe("all");
  });
});

describe("hasActiveFilters", () => {
  it("does not count the month on its own as filtering", () => {
    expect(hasActiveFilters(parseTransactionFilters({}, TODAY))).toBe(false);
    expect(hasActiveFilters(parseTransactionFilters({ month: "2026-01-01" }, TODAY))).toBe(false);
  });

  it("counts anything narrower", () => {
    expect(hasActiveFilters(parseTransactionFilters({ direction: "income" }, TODAY))).toBe(true);
    expect(hasActiveFilters(parseTransactionFilters({ q: "rent" }, TODAY))).toBe(true);
    expect(hasActiveFilters(parseTransactionFilters({ status: "all" }, TODAY))).toBe(true);
  });
});
