import { startOfMonth, todayIso } from "@app/lib/date";

/**
 * What day it is, in one place.
 *
 * This was four hardcoded constants — `"2026-08-09"` in three screens and
 * `"2026-08-01"` in the shell — which made the whole app frozen in time. Every
 * entry would have been dated 9 August 2026 for ever, the dashboard would never
 * have moved to September, and a debt payoff would have counted from a date in
 * the past that never advanced. Fine for a test fixture, ruinous in something
 * installed on a phone.
 *
 * `todayIso` is the shipped module's, given the device's own time zone. Deriving
 * the date from a UTC instant is what puts a Sunday evening expense on Saturday
 * for anyone west of Greenwich, and Singapore is eight hours the other way.
 *
 * The `?today=` override is what keeps the tests deterministic now that the
 * clock is real. Without it they would pass this month and fail in September,
 * which is worse than either a frozen clock or a real one — it is a suite that
 * lies about when it is telling the truth.
 */

const OVERRIDE = new URLSearchParams(location.search).get("today");
const isCalendarDate = (value: string | null): value is string =>
  value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const TODAY = isCalendarDate(OVERRIDE)
  ? OVERRIDE
  : todayIso(Intl.DateTimeFormat().resolvedOptions().timeZone);

/** The month the dashboard, budgets and income screens are showing. */
export const PERIOD_MONTH = startOfMonth(TODAY);
