/**
 * Currency, locale and timezone options for the profile screen.
 *
 * Every amount is stored and displayed in the profile's base currency. Holding
 * balances in several currencies at once needs FX rates and a conversion policy,
 * which is deliberately out of scope — the currency here only decides how
 * figures are labelled and formatted.
 */

export const DEFAULT_CURRENCY = "SGD";
export const DEFAULT_LOCALE = "en-SG";
export const DEFAULT_TIMEZONE = "Asia/Singapore";

export const CURRENCIES = [
  { code: "SGD", label: "Singapore dollar" },
  { code: "USD", label: "US dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "Pound sterling" },
  { code: "MYR", label: "Malaysian ringgit" },
  { code: "AUD", label: "Australian dollar" },
  { code: "HKD", label: "Hong Kong dollar" },
  { code: "JPY", label: "Japanese yen" },
  { code: "CNY", label: "Chinese yuan" },
  { code: "INR", label: "Indian rupee" },
  { code: "IDR", label: "Indonesian rupiah" },
  { code: "THB", label: "Thai baht" },
  { code: "CAD", label: "Canadian dollar" },
  { code: "CHF", label: "Swiss franc" },
  { code: "NZD", label: "New Zealand dollar" },
] as const;

export const LOCALES = [
  { code: "en-SG", label: "English (Singapore)" },
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "zh-SG", label: "Chinese (Singapore)" },
  { code: "ms-MY", label: "Malay (Malaysia)" },
  { code: "de-DE", label: "German (Germany)" },
  { code: "fr-FR", label: "French (France)" },
] as const;

export const TIMEZONES = [
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Jakarta",
  "Asia/Bangkok",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
] as const;

/** Currency symbol on its own, for prefixing an amount input. */
export function currencySymbol(currency: string, locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}
