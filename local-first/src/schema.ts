import {
  createAppOwner,
  createEvolu,
  createOwnerWebSocketTransport,
  FiniteNumber,
  id,
  Mnemonic,
  mnemonicToOwnerSecret,
  NonEmptyString100,
  NonEmptyString1000,
  SimpleName,
} from "@evolu/common";
import { evoluReactWebDeps } from "@evolu/react-web";

/**
 * Smart Planner's schema, on the device.
 *
 * The invariants are the same ones the Postgres version enforces, because they
 * are properties of the money and not of the database:
 *
 * - Amounts are integer minor units. `FiniteNumber` holding 1234, never 12.34.
 * - Dates are `YYYY-MM-DD` calendar strings. A JS Date in local time shifts the
 *   day, which is how a Sunday expense lands on Saturday.
 * - The daily / fixed / recurring split and active / passive income split are
 *   carried as string unions, checked at the edges by the domain layer.
 *
 * What is deliberately absent: user_id. There are no other users here. The
 * device holds one person's data, and the owner key is the boundary that RLS
 * used to be.
 */

/**
 * The stand-in for "no value" in a foreign-key-ish column.
 *
 * SQLite would take NULL, but Evolu's string types are non-empty by
 * construction, so a sentinel is needed and it must be spelled the same
 * everywhere. Defining it here rather than typing "-" at each call site is what
 * stops a budget with no category being read as a budget for a category that
 * does not exist — which is exactly the bug this constant replaces.
 */
export const NONE = "-";

export const CategoryId = id("Category");
export type CategoryId = typeof CategoryId.Type;
export const AccountId = id("Account");
export type AccountId = typeof AccountId.Type;
export const TransactionId = id("Transaction");
export type TransactionId = typeof TransactionId.Type;
export const BudgetId = id("Budget");
export type BudgetId = typeof BudgetId.Type;
export const RecurringRuleId = id("RecurringRule");
export type RecurringRuleId = typeof RecurringRuleId.Type;
export const GoalId = id("Goal");
export type GoalId = typeof GoalId.Type;
export const DebtId = id("Debt");
export type DebtId = typeof DebtId.Type;
export const AssetId = id("Asset");
export type AssetId = typeof AssetId.Type;

export const Schema = {
  category: {
    id: CategoryId,
    name: NonEmptyString100,
    kind: NonEmptyString100, // CategoryKind
    color: NonEmptyString100,
    sortOrder: FiniteNumber,
    isArchived: FiniteNumber, // 0 | 1 — SQLite has no boolean
  },
  account: {
    id: AccountId,
    name: NonEmptyString100,
    type: NonEmptyString100, // AccountType
    openingBalanceMinor: FiniteNumber,
    isLiquid: FiniteNumber,
    isArchived: FiniteNumber,
  },
  transaction: {
    id: TransactionId,
    occurredOn: NonEmptyString100, // IsoDate
    amountMinor: FiniteNumber,
    direction: NonEmptyString100, // TransactionDirection
    incomeType: NonEmptyString100, // IncomeType | ""
    expenseNature: NonEmptyString100, // ExpenseNature | ""
    status: NonEmptyString100, // TransactionStatus
    categoryId: NonEmptyString100,
    accountId: NonEmptyString100,
    merchant: NonEmptyString100,
    note: NonEmptyString1000,
    recurringRuleId: NonEmptyString100,
  },
  budget: {
    id: BudgetId,
    periodMonth: NonEmptyString100, // first of month, YYYY-MM-01
    categoryId: NonEmptyString100, // "" means the overall cap
    limitMinor: FiniteNumber,
    warnThresholdPct: FiniteNumber,
  },
  recurringRule: {
    id: RecurringRuleId,
    label: NonEmptyString100,
    direction: NonEmptyString100,
    expenseNature: NonEmptyString100, // "fixed" | "recurring"
    incomeType: NonEmptyString100,
    categoryId: NonEmptyString100,
    accountId: NonEmptyString100,
    frequency: NonEmptyString100, // RecurrenceFrequency
    intervalCount: FiniteNumber,
    dayOfMonth: FiniteNumber,
    startDate: NonEmptyString100,
    endDate: NonEmptyString100,
    amountMinor: FiniteNumber,
    estimatedAmountMinor: FiniteNumber,
    lastMaterializedOn: NonEmptyString100,
    isActive: FiniteNumber,
  },
  goal: {
    id: GoalId,
    name: NonEmptyString100,
    targetMinor: FiniteNumber,
    currentMinor: FiniteNumber,
    targetDate: NonEmptyString100,
    isCompleted: FiniteNumber,
  },
  debt: {
    id: DebtId,
    name: NonEmptyString100,
    principalMinor: FiniteNumber,
    remainingMinor: FiniteNumber,
    aprBps: FiniteNumber, // basis points, so the rate is an integer too
    minimumPaymentMinor: FiniteNumber,
    isClosed: FiniteNumber,
  },
  asset: {
    id: AssetId,
    name: NonEmptyString100,
    type: NonEmptyString100, // AssetType
    valueMinor: FiniteNumber,
    asOf: NonEmptyString100,
  },
};


/**
 * Row types are NOT declared here.
 *
 * `InferRow` infers from a Query, not from a table definition, so
 * `InferRow<typeof Schema.transaction>` silently resolved to `never` — every
 * row type in the app was `never`, and nothing complained because the screens
 * coerce with String() and Number() anyway. They are derived from the queries
 * in db.ts instead, which is where a Query actually exists.
 */

/**
 * Creates the local database.
 *
 * With no mnemonic the instance is local-only: it still works completely, it
 * simply has nowhere to sync to. That is the default an installed app starts
 * in — no account, no server, nothing to sign up for. A mnemonic and a relay
 * are what a user opts into later to reach a second device.
 */
export function createLocalDb(options: {
  instanceName: string;
  mnemonic?: string;
  relayUrl?: string;
}) {
  const owner = options.mnemonic
    ? createAppOwner(mnemonicToOwnerSecret(Mnemonic.orThrow(options.mnemonic)))
    : undefined;

  const transports =
    owner && options.relayUrl
      ? [createOwnerWebSocketTransport({ url: options.relayUrl, ownerId: owner.id })]
      : [];

  return {
    owner,
    evolu: createEvolu(evoluReactWebDeps)(Schema, {
      name: SimpleName.orThrow(options.instanceName),
      ...(owner ? { externalAppOwner: owner } : {}),
      transports,
    }),
  };
}
