/**
 * Transaction list filters.
 *
 * Filters live in the URL so a filtered view can be bookmarked, shared between
 * your phone and laptop, and survives a refresh. Parsing is pure and defensive:
 * a hand-edited query string can never produce a filter the database will
 * choke on, it just falls back to the default.
 */

import { startOfMonth, todayIso, type IsoDate } from "@/lib/date";
import type { ExpenseNature, IncomeType, TransactionDirection } from "@/types/database";

export type DirectionFilter = TransactionDirection | "all";
export type NatureFilter = ExpenseNature | "all";
export type IncomeTypeFilter = IncomeType | "all";
export type StatusFilter = "confirmed" | "draft" | "all";

export type TransactionFilters = {
  /** Month start date, or null for every month. */
  month: IsoDate | null;
  direction: DirectionFilter;
  nature: NatureFilter;
  incomeType: IncomeTypeFilter;
  categoryId: string | null;
  accountId: string | null;
  search: string | null;
  status: StatusFilter;
  page: number;
};

export const PAGE_SIZE = 50;

const DIRECTIONS: DirectionFilter[] = ["expense", "income", "all"];
const NATURES: NatureFilter[] = ["daily", "fixed", "recurring", "all"];
const INCOME_TYPES: IncomeTypeFilter[] = ["active", "passive", "all"];
const STATUSES: StatusFilter[] = ["confirmed", "draft", "all"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: T[],
  fallback: T,
): T {
  return value && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

/** Defaults to the current month, all directions, confirmed entries only. */
export function parseTransactionFilters(
  params: RawSearchParams,
  today: IsoDate = todayIso(),
): TransactionFilters {
  const rawMonth = first(params.month);
  const month =
    rawMonth === "all"
      ? null
      : rawMonth && ISO_DATE.test(rawMonth)
        ? startOfMonth(rawMonth)
        : startOfMonth(today);

  const rawCategory = first(params.category);
  const rawAccount = first(params.account);
  const rawSearch = first(params.q)?.trim();
  const rawPage = Number(first(params.page));

  return {
    month,
    direction: oneOf(first(params.direction), DIRECTIONS, "all"),
    nature: oneOf(first(params.nature), NATURES, "all"),
    incomeType: oneOf(first(params.incomeType), INCOME_TYPES, "all"),
    categoryId: rawCategory && UUID.test(rawCategory) ? rawCategory : null,
    accountId: rawAccount && UUID.test(rawAccount) ? rawAccount : null,
    search: rawSearch ? rawSearch.slice(0, 100) : null,
    status: oneOf(first(params.status), STATUSES, "confirmed"),
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

/**
 * Serialise back to a query string, omitting anything left at its default so
 * the URL stays readable.
 */
export function filtersToSearchParams(filters: Partial<TransactionFilters>): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.month === null) params.set("month", "all");
  else if (filters.month) params.set("month", filters.month);

  if (filters.direction && filters.direction !== "all") params.set("direction", filters.direction);
  if (filters.nature && filters.nature !== "all") params.set("nature", filters.nature);
  if (filters.incomeType && filters.incomeType !== "all")
    params.set("incomeType", filters.incomeType);
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.accountId) params.set("account", filters.accountId);
  if (filters.search) params.set("q", filters.search);
  if (filters.status && filters.status !== "confirmed") params.set("status", filters.status);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));

  return params;
}

/** True when anything beyond the month is narrowing the list. */
export function hasActiveFilters(filters: TransactionFilters): boolean {
  return (
    filters.direction !== "all" ||
    filters.nature !== "all" ||
    filters.incomeType !== "all" ||
    filters.categoryId !== null ||
    filters.accountId !== null ||
    filters.search !== null ||
    filters.status !== "confirmed"
  );
}
