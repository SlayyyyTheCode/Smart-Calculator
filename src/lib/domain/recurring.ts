/**
 * Recurring rule date math.
 *
 * Two kinds of recurring entry, kept deliberately distinct:
 *
 *   fixed     - same amount every period (rent, insurance premium). The cron
 *               job posts these as confirmed transactions automatically.
 *   recurring - repeats every period but the amount varies (electricity,
 *               groceries). The cron job posts a draft using the estimate; you
 *               confirm it with the real figure when the bill lands. Drafts are
 *               excluded from every total until confirmed.
 *
 * Occurrences are always computed from the rule's anchor rather than by
 * repeatedly stepping the previous result, so a rule anchored on the 31st gives
 * Jan 31, Feb 28, Mar 31 — it does not drift down to the 28th forever after the
 * first short month.
 */

import {
  addDays,
  addMonths,
  compareIsoDates,
  daysInMonth,
  parseIsoDate,
  toIsoDate,
  type IsoDate,
} from "@/lib/date";
import type { RecurrenceFrequency } from "@/lib/domain/enums";

export type RecurrenceSpec = {
  frequency: RecurrenceFrequency;
  /** How many frequency units between occurrences. 2 + monthly = every other month. */
  intervalCount: number;
  startDate: IsoDate;
  endDate?: IsoDate | null;
  /** Preferred day for monthly-family rules. Falls back to the start date's day. */
  dayOfMonth?: number | null;
};

/** How many months one step of each frequency covers. Weekly is handled separately. */
const MONTHS_PER_STEP: Record<Exclude<RecurrenceFrequency, "weekly">, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

function normalizedInterval(spec: RecurrenceSpec): number {
  const n = Math.trunc(spec.intervalCount);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** The nth occurrence (0-based) of a rule, ignoring endDate. */
export function occurrenceAt(spec: RecurrenceSpec, index: number): IsoDate {
  const interval = normalizedInterval(spec);

  if (spec.frequency === "weekly") {
    return addDays(spec.startDate, 7 * interval * index);
  }

  const start = parseIsoDate(spec.startDate);
  const anchorDay = spec.dayOfMonth ?? start.day;
  const monthStep = MONTHS_PER_STEP[spec.frequency] * interval * index;

  // Step the month from the first of the month, then clamp the anchor day. This
  // is what keeps Jan 31 -> Feb 28 -> Mar 31 instead of collapsing to the 28th.
  const monthAnchor = addMonths(toIsoDate({ ...start, day: 1 }), monthStep);
  const { year, month } = parseIsoDate(monthAnchor);
  return toIsoDate({ year, month, day: Math.min(anchorDay, daysInMonth(year, month)) });
}

/** Every occurrence in [from, to] inclusive, oldest first. */
export function occurrencesBetween(
  spec: RecurrenceSpec,
  from: IsoDate,
  to: IsoDate,
  maxResults = 500,
): IsoDate[] {
  const results: IsoDate[] = [];
  if (compareIsoDates(to, spec.startDate) < 0) return results;

  const limit = spec.endDate && compareIsoDates(spec.endDate, to) < 0 ? spec.endDate : to;

  for (let index = 0; results.length < maxResults; index += 1) {
    const date = occurrenceAt(spec, index);
    if (compareIsoDates(date, limit) > 0) break;
    if (compareIsoDates(date, from) >= 0) results.push(date);

    // Guard against a malformed spec producing a non-advancing sequence.
    if (index > 10_000) break;
  }

  return results;
}

/** The first occurrence on or after `from`, or null once the rule has ended. */
export function nextOccurrence(spec: RecurrenceSpec, from: IsoDate): IsoDate | null {
  for (let index = 0; index <= 10_000; index += 1) {
    const date = occurrenceAt(spec, index);
    if (spec.endDate && compareIsoDates(date, spec.endDate) > 0) return null;
    if (compareIsoDates(date, from) >= 0) return date;
  }
  return null;
}

/**
 * Occurrences the materialization cron still owes, up to and including today.
 *
 * `lastMaterializedOn` is exclusive: a rule already posted for the 1st resumes
 * from the 2nd. The unique index on (recurring_rule_id, occurred_on) makes a
 * double run harmless regardless, but this keeps the work small.
 */
export function dueOccurrences(
  spec: RecurrenceSpec,
  today: IsoDate,
  lastMaterializedOn?: IsoDate | null,
): IsoDate[] {
  const from = lastMaterializedOn ? addDays(lastMaterializedOn, 1) : spec.startDate;
  if (compareIsoDates(from, today) > 0) return [];
  return occurrencesBetween(spec, from, today);
}

/** Plain-English recurrence, e.g. "Every 2 months on the 15th". */
export function describeRecurrence(spec: RecurrenceSpec): string {
  const interval = normalizedInterval(spec);
  const unit =
    spec.frequency === "weekly"
      ? "week"
      : spec.frequency === "monthly"
        ? "month"
        : spec.frequency === "quarterly"
          ? "quarter"
          : "year";

  const cadence = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;

  if (spec.frequency === "weekly") return cadence;

  const day = spec.dayOfMonth ?? parseIsoDate(spec.startDate).day;
  return `${cadence} on the ${ordinal(day)}`;
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}
