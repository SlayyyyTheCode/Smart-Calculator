import type { Minor } from "@/lib/money";

/**
 * CPF contributions, and the take-home pay that falls out of them.
 *
 * Source: CPF Board contribution rate tables, both the one in force and the one
 * that replaces it:
 * https://www.cpf.gov.sg/employer/employer-obligations/how-much-cpf-contributions-to-pay
 *
 * Rates are chosen by the date the wage is **paid**, so the 2027 schedule takes
 * over on its own at the turn of the year and a back-dated payslip keeps the
 * figure that was actually deducted from it.
 *
 * Only the **employee's** share is modelled here, because that is the only part
 * that changes what lands in a bank account. The employer's share is real money
 * and goes into the same CPF accounts, but it was never in the salary figure a
 * person types into this app, so subtracting it would understate their income.
 *
 * A useful simplification, checked rather than assumed: for 1st- and 2nd-year
 * PRs the Board publishes two schemes — Graduated/Graduated and Full employer /
 * Graduated employee. They differ only in the **employer's** share; the
 * employee's column is identical in both. So the F/G election, which needs a
 * joint application to the Board, cannot change take-home pay and this module
 * does not ask about it.
 *
 * Everything is integer minor units (cents), like the rest of the app.
 */

/** Which rate table applies. PRs move to the citizen table in their 3rd year. */
export type CpfResidency = "citizen_or_pr3" | "pr_year1" | "pr_year2" | "none";

export type CpfInput = {
  /** Ordinary Wages for one month, in cents. Gross, before any deduction. */
  grossMonthly: Minor;
  /** Age in completed years at the time of the payment. */
  age: number;
  residency: CpfResidency;
  /**
   * The calendar date the wage is paid, `YYYY-MM-DD`.
   *
   * Required rather than defaulted to today, because a default would be a
   * silent choice of rate schedule — and the wrong one for anything entered
   * late or back-dated.
   */
  onDate: string;
};

export type CpfResult = {
  /** The employee's CPF contribution, in cents. */
  employeeContribution: Minor;
  /** Gross less the employee's contribution, in cents. */
  takeHome: Minor;
  /** Which age band applied, for showing the user why. */
  band: string;
  /** True when the wage was above the Ordinary Wage ceiling and got capped. */
  cappedByCeiling: boolean;
  /** Which published rate schedule was applied, for showing the user why. */
  schedule: string;
};

/**
 * The Ordinary Wage ceiling: $8,000 a month from 1 January 2026.
 *
 * Confirmed against the table rather than taken on trust — Table 1 gives a
 * maximum contribution of $2,960 at 37%, and 0.37 × 8000 = 2960.
 */
export const OW_CEILING: Minor = 800_000;

/** Below this, nobody contributes anything. */
const NO_CONTRIBUTION_CEILING: Minor = 5_000; // $50

/** Between $50 and $500 the employer pays alone; the employee's share is nil. */
const EMPLOYEE_FREE_CEILING: Minor = 50_000; // $500

/** Above $750 the full percentage applies. Between the two, it phases in. */
const FULL_RATE_FLOOR: Minor = 75_000; // $750

type Band = {
  /** Upper bound of the band in completed years, inclusive. */
  maxAge: number;
  label: string;
  /**
   * Employee share on wages above $750, in basis points. 20% is 2000.
   *
   * Integers, not percentages, for the reason the whole app holds money in
   * cents: `0.57 * 20000` is `11399.999999999998` in IEEE 754, and flooring
   * that to whole dollars gives $113 where the table says $114. The existing
   * coefficients happened to land on the right side of the error and the two
   * added for 2027 did not — which is exactly how a rule survives for years and
   * then quietly pays somebody a dollar short.
   */
  rateBps: number;
  /**
   * The phase-in coefficient for wages between $500 and $750, also in basis
   * points: the employee pays `coefficient × (wage − $500)`. It is not the same
   * as the rate and is not derivable from it — both come from the table.
   */
  phaseInBps: number;
};

/**
 * Table 1, from 1 January 2026. Singapore Citizens, and PRs from their 3rd year.
 */
const CITIZEN_2026: readonly Band[] = [
  { maxAge: 55, label: "55 and below", rateBps: 2000, phaseInBps: 6000 },
  { maxAge: 60, label: "above 55 to 60", rateBps: 1800, phaseInBps: 5400 },
  { maxAge: 65, label: "above 60 to 65", rateBps: 1250, phaseInBps: 3750 },
  { maxAge: 70, label: "above 65 to 70", rateBps: 750, phaseInBps: 2250 },
  { maxAge: Infinity, label: "above 70", rateBps: 500, phaseInBps: 1500 },
];

/**
 * Table 1, from 1 January 2027.
 *
 * Two bands move and the rest stand still: above 55 to 60 goes from 18% to 19%,
 * and above 60 to 65 from 12.5% to 13%. The phase-in coefficients for the $500
 * to $750 band move with them — 0.54 to 0.57, and 0.375 to 0.39 — and are taken
 * from the published table rather than derived, because they are not a fixed
 * multiple of the percentage and guessing one would be wrong by a few dollars
 * on exactly the wages least able to absorb it.
 *
 * The Ordinary Wage ceiling stays at $8,000, which the table confirms
 * arithmetically: 19% of 8,000 is the $1,520 maximum it states, and 13% of
 * 8,000 is $1,040.
 */
const CITIZEN_2027: readonly Band[] = [
  { maxAge: 55, label: "55 and below", rateBps: 2000, phaseInBps: 6000 },
  { maxAge: 60, label: "above 55 to 60", rateBps: 1900, phaseInBps: 5700 },
  { maxAge: 65, label: "above 60 to 65", rateBps: 1300, phaseInBps: 3900 },
  { maxAge: 70, label: "above 65 to 70", rateBps: 750, phaseInBps: 2250 },
  { maxAge: Infinity, label: "above 70", rateBps: 500, phaseInBps: 1500 },
];

/** Table 2: 1st year of PR status. Note there is no 65–70 split here. */
const PR_YEAR1: readonly Band[] = [
  { maxAge: 55, label: "55 and below", rateBps: 500, phaseInBps: 1500 },
  { maxAge: 60, label: "above 55 to 60", rateBps: 500, phaseInBps: 1500 },
  { maxAge: 65, label: "above 60 to 65", rateBps: 500, phaseInBps: 1500 },
  { maxAge: Infinity, label: "above 65", rateBps: 500, phaseInBps: 1500 },
];

/** Table 3: 2nd year of PR status. Unchanged in 2027. */
const PR_YEAR2: readonly Band[] = [
  { maxAge: 55, label: "55 and below", rateBps: 1500, phaseInBps: 4500 },
  { maxAge: 60, label: "above 55 to 60", rateBps: 1250, phaseInBps: 3750 },
  { maxAge: 65, label: "above 60 to 65", rateBps: 750, phaseInBps: 2250 },
  { maxAge: Infinity, label: "above 65", rateBps: 500, phaseInBps: 1500 },
];

type Schedule = {
  /** First calendar date this schedule applies to, inclusive. */
  effectiveFrom: string;
  label: string;
  tables: Record<Exclude<CpfResidency, "none">, readonly Band[]>;
};

/**
 * The rate schedules, newest first.
 *
 * Keyed on the date the wage is **paid**, not on today. That distinction is the
 * whole point of holding more than one schedule: a December salary entered in
 * January is a December salary and takes December's rates, and a payslip from
 * last year keeps the figure that was actually deducted. Reading the clock
 * instead would restate history every time a rate changed.
 *
 * It also gives the automatic switch for free. Quick add dates an entry today
 * by default, and today comes from the device's own calendar — so at midnight
 * on 1 January 2027 the next salary recorded picks up the new rates with
 * nothing to update and nothing to remember.
 *
 * A date older than the earliest schedule falls back to it. The app does not
 * carry pre-2026 tables, and that is a stated approximation rather than a
 * silent one: back-dating a 2024 payslip will compute it at 2026 rates.
 */
const SCHEDULES: readonly Schedule[] = [
  {
    effectiveFrom: "2027-01-01",
    label: "1 January 2027",
    tables: { citizen_or_pr3: CITIZEN_2027, pr_year1: PR_YEAR1, pr_year2: PR_YEAR2 },
  },
  {
    effectiveFrom: "2026-01-01",
    label: "1 January 2026",
    tables: { citizen_or_pr3: CITIZEN_2026, pr_year1: PR_YEAR1, pr_year2: PR_YEAR2 },
  },
];

/** The schedule in force on a given calendar date. */
export function scheduleOn(onDate: string): Schedule {
  return SCHEDULES.find((s) => onDate >= s.effectiveFrom) ?? SCHEDULES[SCHEDULES.length - 1];
}

/**
 * The band for an age.
 *
 * "55 and below" then "above 55 to 60" means exactly 55 falls in the first
 * band and 56 in the second — the boundary belongs to the younger band, which
 * is why this is `<=` and not `<`.
 */
function bandFor(age: number, bands: readonly Band[]): Band {
  return bands.find((band) => age <= band.maxAge) ?? bands[bands.length - 1];
}

/**
 * The employee's CPF contribution for one month of Ordinary Wages.
 *
 * The Board's rounding: the total contribution is rounded to the nearest
 * dollar, and the employee's share is rounded **down** to the nearest dollar,
 * with the employer taking the remainder. Only the employee's share matters
 * here, so only the rounding-down rule is applied — and it is applied, because
 * dropping it would overstate the deduction by up to 99 cents every month.
 */
export function cpfContribution(input: CpfInput): CpfResult {
  const { grossMonthly, age, residency, onDate } = input;
  const schedule = scheduleOn(onDate);

  if (residency === "none" || grossMonthly <= NO_CONTRIBUTION_CEILING) {
    return {
      employeeContribution: 0,
      takeHome: grossMonthly,
      band: residency === "none" ? "not applicable" : "$50 or less",
      cappedByCeiling: false,
      schedule: schedule.label,
    };
  }

  const band = bandFor(age, schedule.tables[residency]);
  const cappedByCeiling = grossMonthly > OW_CEILING;
  const wage = Math.min(grossMonthly, OW_CEILING);

  let contribution: Minor;
  if (grossMonthly <= EMPLOYEE_FREE_CEILING) {
    // The employer contributes; the employee does not.
    contribution = 0;
  } else if (grossMonthly <= FULL_RATE_FLOOR) {
    // Phased in on the amount above $500 only. The coefficient is applied to
    // dollars, so the cents figure is scaled the same way.
    // Integer throughout: multiply first, divide last.
    contribution = Math.floor((band.phaseInBps * (grossMonthly - EMPLOYEE_FREE_CEILING)) / 10_000);
  } else {
    contribution = Math.floor((band.rateBps * wage) / 10_000);
  }

  // Rounded down to whole dollars, per the Board's step 2.
  contribution = Math.floor(contribution / 100) * 100;

  return {
    employeeContribution: contribution,
    takeHome: grossMonthly - contribution,
    band: band.label,
    cappedByCeiling,
    schedule: schedule.label,
  };
}

/**
 * Completed years between two calendar dates.
 *
 * On `YYYY-MM-DD` strings rather than Date objects, for the reason the rest of
 * the app avoids them: a Date in local time can shift the day, and a birthday
 * that moves by a day can move somebody into the wrong contribution band.
 */
export function ageOn(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [oy, om, od] = onDate.split("-").map(Number);
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}
