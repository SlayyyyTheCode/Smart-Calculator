/**
 * Money handling.
 *
 * Amounts are carried through the app as integer minor units (cents), because
 * 0.1 + 0.2 !== 0.3 in binary floating point and a budget that is off by a cent
 * is a budget nobody trusts. Postgres stores numeric(14,2); the boundary
 * conversions live here and nowhere else.
 */

import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from "@/lib/currency";

/** An integer number of minor units, e.g. 1234 means 12.34. */
export type Minor = number;

const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Parse user input or a numeric-string from Postgres into minor units.
 * Returns null for anything that is not a well-formed amount, so callers can
 * show a validation message instead of storing NaN.
 */
export function parseAmount(input: string | number | null | undefined): Minor | null {
  if (input === null || input === undefined) return null;

  const raw = String(input).trim().replace(/[\s,_]/g, "");
  if (raw === "") return null;

  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match) return null;

  const [, sign, whole = "", fraction = ""] = match;
  if (whole === "" && fraction === "") return null;

  const paddedFraction = fraction.padEnd(2, "0");
  let minor = Number(whole || "0") * MINOR_UNITS_PER_MAJOR + Number(paddedFraction.slice(0, 2));

  // More precision than a currency has: round half up on the decimal digits
  // themselves. Going via Number() first would lose the answer, because
  // Number("1.005") * 100 is 100.49999999999999, which rounds the wrong way.
  if (fraction.length > 2 && Number(fraction[2]) >= 5) {
    minor += 1;
  }

  if (!Number.isSafeInteger(minor)) return null;
  return sign === "-" ? -minor : minor;
}

/** Same as parseAmount but throws — for data that came out of the database. */
export function toMinor(input: string | number): Minor {
  const parsed = parseAmount(input);
  if (parsed === null) {
    throw new Error(`Cannot read "${input}" as a monetary amount`);
  }
  return parsed;
}

/** Minor units back to the decimal form Postgres numeric expects. */
export function toMajorString(minor: Minor): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const whole = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const fraction = String(abs % MINOR_UNITS_PER_MAJOR).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function toMajorNumber(minor: Minor): number {
  return Math.round(minor) / MINOR_UNITS_PER_MAJOR;
}

export function sumMinor(values: Iterable<Minor>): Minor {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Multiply by a ratio and round to the nearest minor unit.
 * Used for things like "40% of this budget", never for currency conversion.
 */
export function scaleMinor(minor: Minor, factor: number): Minor {
  return Math.round(minor * factor);
}

export function formatMoney(
  minor: Minor,
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    ...options,
  }).format(toMajorNumber(minor));
}

/** Compact form for dashboard tiles: $1.2K, $3.4M. */
export function formatMoneyCompact(minor: Minor, currency = "USD", locale = "en-US"): string {
  return formatMoney(minor, currency, locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export function formatPercent(ratio: number, locale = DEFAULT_LOCALE, digits = 0): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}
