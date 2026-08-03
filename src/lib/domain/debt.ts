/**
 * Debt payoff projection.
 *
 * Simulated month by month rather than solved with the closed-form
 * amortisation formula. The formula gives a fractional number of months and an
 * interest figure that quietly disagrees with reality by a few dollars; a
 * lender charges interest on the balance that is actually outstanding, rounds
 * it to the cent, and takes a smaller final payment. Simulating does the same,
 * so the payoff date and the total interest are the ones you will really see.
 */

import { addMonths, type IsoDate } from "@/lib/date";
import type { Minor } from "@/lib/money";

export type DebtTerms = {
  /** What is still owed, in minor units. */
  balance: Minor;
  /** Annual percentage rate, e.g. 18.9 for 18.9%. */
  apr: number;
  /** What is paid each month. */
  monthlyPayment: Minor;
};

export type PayoffResult =
  | {
      paysOff: true;
      months: number;
      totalInterest: Minor;
      totalPaid: Minor;
      /** The payment that clears the last month, usually smaller than the rest. */
      finalPayment: Minor;
    }
  | {
      paysOff: false;
      /** Interest accruing each month at the current balance. */
      monthlyInterest: Minor;
      /** The smallest payment that would begin to reduce the balance. */
      minimumViablePayment: Minor;
    };

/** Anything beyond this is "never" for a person's purposes. */
const MAX_MONTHS = 1200;

function monthlyRate(apr: number): number {
  if (!Number.isFinite(apr) || apr <= 0) return 0;
  return apr / 100 / 12;
}

/**
 * How long this debt takes to clear, and what it costs to get there.
 *
 * A payment that does not cover the monthly interest never clears the debt, and
 * saying so plainly is more useful than a projection of 1,200 months.
 */
export function projectPayoff({ balance, apr, monthlyPayment }: DebtTerms): PayoffResult {
  const rate = monthlyRate(apr);
  const firstMonthInterest = Math.round(balance * rate);

  if (balance <= 0) {
    return { paysOff: true, months: 0, totalInterest: 0, totalPaid: 0, finalPayment: 0 };
  }

  if (monthlyPayment <= firstMonthInterest) {
    return {
      paysOff: false,
      monthlyInterest: firstMonthInterest,
      // One cent more than the interest is the point at which the balance
      // starts, however slowly, to fall.
      minimumViablePayment: firstMonthInterest + 1,
    };
  }

  let remaining = balance;
  let totalInterest = 0;
  let totalPaid = 0;
  let months = 0;
  let finalPayment = monthlyPayment;

  while (remaining > 0 && months < MAX_MONTHS) {
    const interest = Math.round(remaining * rate);
    const due = remaining + interest;
    // The last payment is only what is left, not the full instalment.
    const payment = Math.min(monthlyPayment, due);

    remaining = due - payment;
    totalInterest += interest;
    totalPaid += payment;
    finalPayment = payment;
    months += 1;
  }

  if (remaining > 0) {
    return {
      paysOff: false,
      monthlyInterest: firstMonthInterest,
      minimumViablePayment: firstMonthInterest + 1,
    };
  }

  return { paysOff: true, months, totalInterest, totalPaid, finalPayment };
}

/** The month the debt clears, from a starting month. */
export function payoffDate(from: IsoDate, months: number): IsoDate {
  return addMonths(from, months);
}

/**
 * What paying extra would save.
 *
 * The comparison people actually want: not "what does this cost" but "what
 * would it cost if I paid a bit more".
 */
export function extraPaymentSaving(
  terms: DebtTerms,
  extra: Minor,
): { monthsSaved: number; interestSaved: Minor } | null {
  if (extra <= 0) return null;

  const base = projectPayoff(terms);
  const faster = projectPayoff({ ...terms, monthlyPayment: terms.monthlyPayment + extra });

  if (!faster.paysOff) return null;
  if (!base.paysOff) {
    // The current payment never clears it, so everything the faster one costs
    // is a saving against an infinite one. Report only what is knowable.
    return { monthsSaved: 0, interestSaved: 0 };
  }

  return {
    monthsSaved: base.months - faster.months,
    interestSaved: base.totalInterest - faster.totalInterest,
  };
}

export type DebtSummary = {
  totalOwed: Minor;
  totalMinimumPayment: Minor;
  /** Weighted by balance — the rate you are effectively paying overall. */
  averageApr: number;
};

export function summariseDebts(
  debts: { remainingBalance: Minor; minimumPayment: Minor; apr: number }[],
): DebtSummary {
  const totalOwed = debts.reduce((sum, debt) => sum + debt.remainingBalance, 0);
  const totalMinimumPayment = debts.reduce((sum, debt) => sum + debt.minimumPayment, 0);

  const weighted = debts.reduce((sum, debt) => sum + debt.apr * debt.remainingBalance, 0);

  return {
    totalOwed,
    totalMinimumPayment,
    averageApr: totalOwed > 0 ? weighted / totalOwed : 0,
  };
}
