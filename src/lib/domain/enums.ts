/**
 * The vocabulary of the domain.
 *
 * These unions used to live in `@/types/database`, which meant every rule that
 * mentioned an expense nature imported the database's type file. That was the
 * only thread tying the domain layer to a particular storage engine, and it was
 * never a real dependency: these are the app's own words, not Postgres's.
 *
 * They live here so `@/lib/domain/*` depends on nothing but itself, `money` and
 * `date`. `@/types/database` re-exports them, so the storage-facing types stay
 * spelled the same way and the two cannot drift.
 */

export type TransactionDirection = "expense" | "income";
export type IncomeType = "active" | "passive";
export type ExpenseNature = "daily" | "fixed" | "recurring";
export type CategoryKind = "expense" | "income";
export type AccountType = "cash" | "bank" | "credit" | "brokerage" | "other";
export type RecurrenceFrequency = "weekly" | "monthly" | "quarterly" | "yearly";
export type TransactionStatus = "confirmed" | "draft";
export type AssetType = "cash" | "investment" | "property" | "other";
export type ImportStatus = "pending" | "committed" | "reverted";
