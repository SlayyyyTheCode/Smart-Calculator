import type { Minor } from "@/lib/money";

/**
 * CPF contributions, and the take-home pay that falls out of them.
 *
 * Source: CPF Board, "CPF contribution rates from 1 January 2026" (Tables 1–5),
 * https://www.cpf.gov.sg/employer/employer-obligations/how-much-cpf-contributions-to-pay
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
  /** Employee percentage on wages above $750. */
  ratePct: number;
  /**
   * The phase-in coefficient for wages between $500 and $750: the employee pays
   * `coefficient × (wage − $500)`. It is not the same as the percentage, and it
   * is not derivable from it — both come from the table.
   */
  phaseIn: number;
};

/** Table 1: Singapore Citizens, and PRs from their 3rd year. */
const CITIZEN_BANDS: readonly Band[] = [
  { maxAge: 55, label: "55 and below", ratePct: 20, phaseIn: 0.6 },
  { maxAge: 60, label: "above 55 to 60", ratePct: 18, phaseIn: 0.54 },
  { maxAge: 65, label: "above 60 to 65", ratePct: 12.5, phaseIn: 0.375 },
  { maxAge: 70, label: "above 65 to 70", ratePct: 7.5, phaseIn: 0.225 },
  { maxAge: Infinity, label: "above 70", ratePct: 5, phaseIn: 0.15 },
];

/** Table 2: 1st year of PR status. Note there is no 65–70 split here. */
const PR_YEAR1_BANDS: readonly Band[] = [
  { maxAge: 55, label: "55 and below", ratePct: 5, phaseIn: 0.15 },
  { maxAge: 60, label: "above 55 to 60", ratePct: 5, phaseIn: 0.15 },
  { maxAge: 65, label: "above 60 to 65", ratePct: 5, phaseIn: 0.15 },
  { maxAge: Infinity, label: "above 65", ratePct: 5, phaseIn: 0.15 },
];

/** Table 3: 2nd year of PR status. */
const PR_YEAR2_BANDS: readonly Band[] = [
  { maxAge: 55, label: "55 and below", ratePct: 15, phaseIn: 0.45 },
  { maxAge: 60, label: "above 55 to 60", ratePct: 12.5, phaseIn: 0.375 },
  { maxAge: 65, label: "above 60 to 65", ratePct: 7.5, phaseIn: 0.225 },
  { maxAge: Infinity, label: "above 65", ratePct: 5, phaseIn: 0.15 },
];

const TABLES: Record<Exclude<CpfResidency, "none">, readonly Band[]> = {
  citizen_or_pr3: CITIZEN_BANDS,
  pr_year1: PR_YEAR1_BANDS,
  pr_year2: PR_YEAR2_BANDS,
};

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
  const { grossMonthly, age, residency } = input;

  if (residency === "none" || grossMonthly <= NO_CONTRIBUTION_CEILING) {
    return {
      employeeContribution: 0,
      takeHome: grossMonthly,
      band: residency === "none" ? "not applicable" : "$50 or less",
      cappedByCeiling: false,
    };
  }

  const band = bandFor(age, TABLES[residency]);
  const cappedByCeiling = grossMonthly > OW_CEILING;
  const wage = Math.min(grossMonthly, OW_CEILING);

  let contribution: Minor;
  if (grossMonthly <= EMPLOYEE_FREE_CEILING) {
    // The employer contributes; the employee does not.
    contribution = 0;
  } else if (grossMonthly <= FULL_RATE_FLOOR) {
    // Phased in on the amount above $500 only. The coefficient is applied to
    // dollars, so the cents figure is scaled the same way.
    contribution = Math.floor(band.phaseIn * (grossMonthly - EMPLOYEE_FREE_CEILING));
  } else {
    contribution = Math.floor((band.ratePct / 100) * wage);
  }

  // Rounded down to whole dollars, per the Board's step 2.
  contribution = Math.floor(contribution / 100) * 100;

  return {
    employeeContribution: contribution,
    takeHome: grossMonthly - contribution,
    band: band.label,
    cappedByCeiling,
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
