/**
 * Savings goals.
 *
 * The number that matters is not how far along you are — a progress bar shows
 * that — but what you have to put aside each month to arrive on time. That is
 * the figure this computes.
 */

import { compareIsoDates, parseIsoDate, type IsoDate } from "@/lib/date";
import type { Minor } from "@/lib/money";

export type Goal = {
  targetAmount: Minor;
  currentAmount: Minor;
  targetDate?: IsoDate | null;
  isCompleted?: boolean;
};

export type GoalStatus = "complete" | "overdue" | "on-schedule" | "no-deadline";

export type GoalProgress = {
  /** 0 to 1, clamped — a goal cannot be more than finished. */
  ratio: number;
  remaining: Minor;
  /** Whole months from today to the target, or null with no target date. */
  monthsRemaining: number | null;
  /** What to set aside each month to arrive on time. */
  requiredMonthly: Minor | null;
  status: GoalStatus;
};

/** Whole months between two calendar dates, counting a part-month as one. */
function monthsUntil(from: IsoDate, to: IsoDate): number {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  const whole = (end.year - start.year) * 12 + (end.month - start.month);
  // A target later in the same month still leaves you that month to save in.
  return end.day >= start.day ? whole : whole - 1;
}

export function goalProgress(goal: Goal, today: IsoDate): GoalProgress {
  const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
  const ratio =
    goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;

  const reached = goal.isCompleted || remaining === 0;

  if (reached) {
    return {
      ratio: 1,
      remaining: 0,
      monthsRemaining: null,
      requiredMonthly: null,
      status: "complete",
    };
  }

  if (!goal.targetDate) {
    return { ratio, remaining, monthsRemaining: null, requiredMonthly: null, status: "no-deadline" };
  }

  if (compareIsoDates(goal.targetDate, today) < 0) {
    return { ratio, remaining, monthsRemaining: 0, requiredMonthly: remaining, status: "overdue" };
  }

  const months = Math.max(monthsUntil(today, goal.targetDate), 0);

  return {
    ratio,
    remaining,
    monthsRemaining: months,
    // With no whole months left, the whole remainder is due now.
    requiredMonthly: months === 0 ? remaining : Math.ceil(remaining / months),
    status: "on-schedule",
  };
}

/** Totals across every goal, for the page header. */
export function summariseGoals(goals: Goal[], today: IsoDate) {
  let targetTotal = 0;
  let savedTotal = 0;
  let monthlyTotal = 0;
  let completed = 0;

  for (const goal of goals) {
    targetTotal += goal.targetAmount;
    savedTotal += Math.min(goal.currentAmount, goal.targetAmount);

    const progress = goalProgress(goal, today);
    if (progress.status === "complete") completed += 1;
    if (progress.requiredMonthly) monthlyTotal += progress.requiredMonthly;
  }

  return { targetTotal, savedTotal, monthlyTotal, completed, count: goals.length };
}
