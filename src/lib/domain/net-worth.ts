/**
 * Net worth: what you own minus what you owe.
 *
 * Assets come from two places and both count once. Accounts hold money that
 * moves — their balance is derived from transactions. The assets table holds
 * things that do not move through your current account: a property, a holding
 * you value periodically. Adding an account to the assets table as well would
 * double-count it, which is the one mistake this composition exists to avoid.
 */

import type { Minor } from "@/lib/money";

export type NetWorthInput = {
  /** Current balances of every non-archived account. */
  accountBalances: Minor[];
  /** Valuations from the assets table. */
  assetValues: Minor[];
  /** Outstanding balances of debts still open. */
  debtBalances: Minor[];
};

export type NetWorthBreakdown = {
  cashAndAccounts: Minor;
  otherAssets: Minor;
  totalAssets: Minor;
  totalLiabilities: Minor;
  netWorth: Minor;
};

export function computeNetWorth({
  accountBalances,
  assetValues,
  debtBalances,
}: NetWorthInput): NetWorthBreakdown {
  const cashAndAccounts = accountBalances.reduce((sum, value) => sum + value, 0);
  const otherAssets = assetValues.reduce((sum, value) => sum + value, 0);
  const totalAssets = cashAndAccounts + otherAssets;
  const totalLiabilities = debtBalances.reduce((sum, value) => sum + value, 0);

  return {
    cashAndAccounts,
    otherAssets,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}

export type NetWorthPoint = {
  asOf: string;
  totalAssets: Minor;
  totalLiabilities: Minor;
  netWorth: Minor;
};

/** Change against the oldest snapshot in the window, for the headline delta. */
export function netWorthChange(points: NetWorthPoint[]): {
  absolute: Minor;
  ratio: number | null;
} | null {
  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const absolute = last.netWorth - first.netWorth;

  return {
    absolute,
    // A ratio against zero or a negative base is not meaningful, so it is not
    // offered rather than being rendered as a misleading percentage.
    ratio: first.netWorth > 0 ? absolute / first.netWorth : null,
  };
}
