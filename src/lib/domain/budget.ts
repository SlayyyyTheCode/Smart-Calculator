/**
 * Budget evaluation — the single source of truth for the warning indicator.
 *
 * The dashboard, the budgets page, the entry form's inline hint, the PDF report
 * and the Excel export all call evaluateBudget(). If you need to change what
 * counts as "close to the limit", change it here and every surface follows.
 */

import type { Minor } from "@/lib/money";

export type BudgetLevel = "ok" | "warning" | "exceeded";

export type BudgetInput = {
  spent: Minor;
  limit: Minor;
  /** Percent of the limit at which the amber warning starts. Defaults to 80. */
  warnThresholdPct?: number;
};

export type BudgetEvaluation = {
  level: BudgetLevel;
  /** Spend as a percentage of the limit. Can exceed 100. */
  pctUsed: number;
  /** Limit minus spend. Negative once the budget is blown. */
  remaining: Minor;
  overspend: Minor;
  spent: Minor;
  limit: Minor;
  warnThresholdPct: number;
};

export const DEFAULT_WARN_THRESHOLD_PCT = 80;

/**
 * Classification, stated once:
 *   pct < threshold             -> ok        (green)
 *   threshold <= pct < 100      -> warning   (amber, "close to your limit")
 *   pct >= 100                  -> exceeded  (red)
 *
 * A limit of zero or less is not a budget you can stay inside, so any spend at
 * all against it counts as exceeded.
 */
export function evaluateBudget({
  spent,
  limit,
  warnThresholdPct = DEFAULT_WARN_THRESHOLD_PCT,
}: BudgetInput): BudgetEvaluation {
  const threshold = clampThreshold(warnThresholdPct);

  if (limit <= 0) {
    return {
      level: spent > 0 ? "exceeded" : "ok",
      pctUsed: spent > 0 ? 100 : 0,
      remaining: -spent,
      overspend: Math.max(spent, 0),
      spent,
      limit,
      warnThresholdPct: threshold,
    };
  }

  const pctUsed = (spent / limit) * 100;
  const level: BudgetLevel =
    pctUsed >= 100 ? "exceeded" : pctUsed >= threshold ? "warning" : "ok";

  return {
    level,
    pctUsed,
    remaining: limit - spent,
    overspend: Math.max(spent - limit, 0),
    spent,
    limit,
    warnThresholdPct: threshold,
  };
}

function clampThreshold(pct: number): number {
  if (!Number.isFinite(pct)) return DEFAULT_WARN_THRESHOLD_PCT;
  return Math.min(100, Math.max(1, Math.round(pct)));
}

/** Human-readable summary used in banners, the PDF and the Excel status column. */
export function describeBudget(evaluation: BudgetEvaluation): string {
  switch (evaluation.level) {
    case "exceeded":
      return "Exceeded";
    case "warning":
      return "Close to limit";
    default:
      return "On track";
  }
}

/** Tailwind classes per level, so colour never gets picked ad hoc in a page. */
export const BUDGET_LEVEL_STYLES: Record<
  BudgetLevel,
  { badge: string; bar: string; text: string; label: string }
> = {
  ok: {
    badge: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "On track",
  },
  warning: {
    badge: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    label: "Close to limit",
  },
  exceeded: {
    badge: "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400",
    bar: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    label: "Exceeded",
  },
};

/** Sort helper: put the budgets that need attention at the top of a list. */
export function byUrgency(a: BudgetEvaluation, b: BudgetEvaluation): number {
  const rank: Record<BudgetLevel, number> = { exceeded: 0, warning: 1, ok: 2 };
  if (rank[a.level] !== rank[b.level]) return rank[a.level] - rank[b.level];
  return b.pctUsed - a.pctUsed;
}
