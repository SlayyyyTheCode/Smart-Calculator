/**
 * Turning recurring rules into transactions.
 *
 * Kept as a pure function so the scheduled job is a thin shell around logic
 * that can be tested without a database, a clock, or a network. The job's only
 * responsibilities are reading rules, calling this, and writing the result.
 *
 * The two natures behave differently on purpose:
 *
 *   fixed     - the amount is known, so the transaction is posted confirmed and
 *               counts toward your totals immediately.
 *   recurring - the amount varies, so a draft is posted using your estimate.
 *               Drafts are excluded from every total until you open one and
 *               enter the real figure, which is what confirms it.
 *
 * Income rules are always confirmed: a salary or a dividend lands as an amount
 * you already know.
 */

import { compareIsoDates, type IsoDate } from "@/lib/date";
import { dueOccurrences, type RecurrenceSpec } from "@/lib/domain/recurring";
import type { Minor } from "@/lib/money";
import type {
  ExpenseNature,
  IncomeType,
  RecurrenceFrequency,
  TransactionDirection,
  TransactionStatus,
} from "@/lib/domain/enums";

export type MaterializableRule = {
  id: string;
  userId: string;
  label: string;
  direction: TransactionDirection;
  incomeType: IncomeType | null;
  expenseNature: ExpenseNature | null;
  categoryId: string | null;
  accountId: string | null;
  amount: Minor | null;
  estimatedAmount: Minor | null;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  dayOfMonth: number | null;
  startDate: IsoDate;
  endDate: IsoDate | null;
  isActive: boolean;
  lastMaterializedOn: IsoDate | null;
};

export type PlannedTransaction = {
  ruleId: string;
  userId: string;
  occurredOn: IsoDate;
  amount: Minor;
  direction: TransactionDirection;
  incomeType: IncomeType | null;
  expenseNature: ExpenseNature | null;
  categoryId: string | null;
  accountId: string | null;
  status: TransactionStatus;
  note: string;
};

export type MaterializationPlan = {
  transactions: PlannedTransaction[];
  /** Where to move the rule's cursor, or null to leave it alone. */
  lastMaterializedOn: IsoDate | null;
  /** Why nothing was planned, when nothing was. */
  skipped?: "inactive" | "not-started" | "ended" | "no-amount" | "up-to-date";
};

const EMPTY: MaterializationPlan = { transactions: [], lastMaterializedOn: null };

function toSpec(rule: MaterializableRule): RecurrenceSpec {
  return {
    frequency: rule.frequency,
    intervalCount: rule.intervalCount,
    startDate: rule.startDate,
    endDate: rule.endDate,
    dayOfMonth: rule.dayOfMonth,
  };
}

/**
 * A variable expense posts its estimate as a draft; everything else posts its
 * real amount as confirmed. A rule missing the amount it needs posts nothing
 * rather than guessing at zero.
 */
function resolveAmount(rule: MaterializableRule): { amount: Minor; status: TransactionStatus } | null {
  if (rule.direction === "expense" && rule.expenseNature === "recurring") {
    return rule.estimatedAmount && rule.estimatedAmount > 0
      ? { amount: rule.estimatedAmount, status: "draft" }
      : null;
  }
  return rule.amount && rule.amount > 0
    ? { amount: rule.amount, status: "confirmed" }
    : null;
}

/** Everything a rule owes up to and including `today`. */
export function planMaterialization(
  rule: MaterializableRule,
  today: IsoDate,
): MaterializationPlan {
  if (!rule.isActive) return { ...EMPTY, skipped: "inactive" };
  if (compareIsoDates(rule.startDate, today) > 0) return { ...EMPTY, skipped: "not-started" };
  if (rule.endDate && compareIsoDates(rule.endDate, today) < 0 && rule.lastMaterializedOn) {
    if (compareIsoDates(rule.lastMaterializedOn, rule.endDate) >= 0) {
      return { ...EMPTY, skipped: "ended" };
    }
  }

  const resolved = resolveAmount(rule);
  if (!resolved) return { ...EMPTY, skipped: "no-amount" };

  const dates = dueOccurrences(toSpec(rule), today, rule.lastMaterializedOn);
  if (dates.length === 0) return { ...EMPTY, skipped: "up-to-date" };

  const transactions = dates.map<PlannedTransaction>((occurredOn) => ({
    ruleId: rule.id,
    userId: rule.userId,
    occurredOn,
    amount: resolved.amount,
    direction: rule.direction,
    incomeType: rule.incomeType,
    expenseNature: rule.expenseNature,
    categoryId: rule.categoryId,
    accountId: rule.accountId,
    status: resolved.status,
    note: rule.label,
  }));

  return {
    transactions,
    lastMaterializedOn: dates[dates.length - 1],
  };
}

export type BatchPlan = {
  transactions: PlannedTransaction[];
  /** Rule id -> the new cursor value to store. */
  cursors: Map<string, IsoDate>;
};

/**
 * Plan a whole set of rules at once.
 *
 * `todayFor` resolves the calendar date per user, because a rule due "on the
 * 1st" means the 1st where its owner lives.
 */
export function planBatch(
  rules: MaterializableRule[],
  todayFor: (userId: string) => IsoDate,
): BatchPlan {
  const transactions: PlannedTransaction[] = [];
  const cursors = new Map<string, IsoDate>();

  for (const rule of rules) {
    const plan = planMaterialization(rule, todayFor(rule.userId));
    if (plan.transactions.length === 0) continue;
    transactions.push(...plan.transactions);
    if (plan.lastMaterializedOn) cursors.set(rule.id, plan.lastMaterializedOn);
  }

  return { transactions, cursors };
}
