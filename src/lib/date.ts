/**
 * Date-only helpers.
 *
 * Every date this app stores is a calendar date with no time and no zone
 * ("2026-03-31"), because "the day you bought coffee" does not move when you
 * fly to another country. Working with JS `Date` objects in local time would
 * silently shift those dates across midnight, so all arithmetic here is done on
 * plain year/month/day integers instead.
 */

import { DEFAULT_LOCALE } from "@/lib/currency";

export type IsoDate = string; // YYYY-MM-DD

export type DateParts = { year: number; month: number; day: number }; // month is 1-12

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: IsoDate): DateParts {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new Error(`Expected a YYYY-MM-DD date, received "${value}"`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function toIsoDate({ year, month, day }: DateParts): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Today in the given IANA timezone, as a calendar date. */
export function todayIso(timeZone = "UTC", now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

/** First day of the month a date falls in. Matches SQL date_trunc('month', ...). */
export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return toIsoDate({ year, month, day: 1 });
}

export function endOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return toIsoDate({ year, month, day: daysInMonth(year, month) });
}

/**
 * Shift by whole months, clamping the day to the target month's length.
 * Jan 31 + 1 month is Feb 28 (or Feb 29 in a leap year), never Mar 3.
 */
export function addMonths(date: IsoDate, count: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const zeroBased = year * 12 + (month - 1) + count;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  return toIsoDate({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

export function addDays(date: IsoDate, count: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + count));
  return toIsoDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

/** Negative when a is before b. Safe because ISO dates sort lexicographically. */
export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The `count` months ending with the month of `date`, oldest first. */
export function lastNMonths(date: IsoDate, count: number): IsoDate[] {
  const anchor = startOfMonth(date);
  return Array.from({ length: count }, (_, i) => addMonths(anchor, i - (count - 1)));
}

/** "March 2026" style label for a month-start date. */
export function formatMonthLabel(month: IsoDate, locale = DEFAULT_LOCALE): string {
  const { year, month: m } = parseIsoDate(month);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, m - 1, 1)));
}

/** "31 Mar 2026" style label for a full date. */
export function formatDateLabel(date: IsoDate, locale = DEFAULT_LOCALE): string {
  const { year, month, day } = parseIsoDate(date);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
