import { createContext, useContext, useMemo } from "react";

import { formatMoney } from "@app/lib/money";

import type { SettingRow } from "./db";

/**
 * How money is written, in one place.
 *
 * `const CURRENCY = "SGD"` appeared in nine screens. Nine copies of a decision
 * is nine chances for eight of them to be updated — and it made the app
 * unshippable outside Singapore, which is the whole point of putting it in a
 * store.
 *
 * The values come from the database rather than from localStorage because they
 * describe the money, not the device: a phone and a laptop showing one account
 * in two different currencies would be a bug, and syncing them together is
 * free once they live in a row.
 */

export const DEFAULT_CURRENCY = "SGD";
export const DEFAULT_LOCALE = "en-SG";

export type MoneyFormat = {
  currency: string;
  locale: string;
  /** Minor units in, a formatted string out. */
  money: (minor: number) => string;
};

const MoneyFormatContext = createContext<MoneyFormat | null>(null);

/**
 * The currency codes that mean something.
 *
 * Worth being precise about what `Intl` does here, because the obvious
 * assumption is wrong and I made it: `Intl.NumberFormat` does **not** reject an
 * unknown currency. It rejects a *malformed* one — anything that is not three
 * ASCII letters throws a RangeError — but "XYZ" and "QQQ" are accepted happily
 * and printed verbatim. Measured, not assumed: `XYZ` gave `1.234,50 XYZ` on
 * every screen.
 *
 * So a try/catch around the formatter is not a validation of the code, only of
 * its shape. `Intl.supportedValuesOf("currency")` is the actual list — 162
 * entries, SGD in it, XYZ not.
 */
export const SUPPORTED_CURRENCIES: readonly string[] = (() => {
  try {
    return Intl.supportedValuesOf("currency");
  } catch {
    // Older runtimes lack it. Shape checking is then the best available, which
    // is what the app did before this existed.
    return [];
  }
})();

export const isKnownCurrency = (code: string): boolean =>
  SUPPORTED_CURRENCIES.length === 0
    ? /^[A-Z]{3}$/.test(code)
    : SUPPORTED_CURRENCIES.includes(code);

/**
 * A currency and locale the runtime will actually format with.
 *
 * The stored value can be older than this code, or have arrived by sync from a
 * device that allowed something this one does not. A RangeError thrown from a
 * formatter would take out whichever screen rendered first, because every
 * amount on the dashboard is a call to this — so the fallback stays, as a
 * backstop rather than as the validation.
 */
function usable(currency: string, locale: string): { currency: string; locale: string } {
  try {
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(1);
    return { currency, locale };
  } catch {
    try {
      new Intl.NumberFormat(DEFAULT_LOCALE, { style: "currency", currency }).format(1);
      // The currency is fine and it was the locale that was not.
      return { currency, locale: DEFAULT_LOCALE };
    } catch {
      return { currency: DEFAULT_CURRENCY, locale: DEFAULT_LOCALE };
    }
  }
}

export function MoneyFormatProvider({
  settings,
  children,
}: {
  settings: readonly SettingRow[];
  children: React.ReactNode;
}) {
  const row = settings[0];

  const value = useMemo<MoneyFormat>(() => {
    const { currency, locale } = usable(
      String(row?.baseCurrency ?? DEFAULT_CURRENCY),
      String(row?.locale ?? DEFAULT_LOCALE),
    );
    return {
      currency,
      locale,
      money: (minor: number) => formatMoney(minor, currency, locale),
    };
  }, [row?.baseCurrency, row?.locale]);

  return <MoneyFormatContext.Provider value={value}>{children}</MoneyFormatContext.Provider>;
}

export function useMoneyFormat(): MoneyFormat {
  const value = useContext(MoneyFormatContext);
  if (!value) throw new Error("useMoneyFormat used outside MoneyFormatProvider");
  return value;
}
