/**
 * Turning the entry form into a validated transaction.
 *
 * Used by the server action when you are online and by the offline queue when
 * you are not, so an entry recorded with no signal is normalised and validated
 * exactly the way one recorded online is. Two implementations here would mean
 * an entry that queues fine and then fails on sync, hours later, with no one
 * watching.
 */

import { formValues } from "@/lib/actions/result";
import { transactionSchema, type TransactionInput } from "@/lib/schemas";

/**
 * The direction radio decides which of income_type / expense_nature is
 * meaningful, so the other is cleared rather than sent as an empty string that
 * would fail validation for a confusing reason.
 */
export function readTransactionForm(formData: FormData): Record<string, unknown> {
  const values = formValues(formData);
  const direction = values.direction;

  const tagsRaw = typeof values.tags === "string" ? values.tags : "";
  const tags = tagsRaw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    ...values,
    tags,
    incomeType: direction === "income" ? values.incomeType : null,
    expenseNature: direction === "expense" ? values.expenseNature : null,
  };
}

export type ParsedTransaction =
  | { ok: true; value: TransactionInput }
  | { ok: false; fieldErrors: Record<string, string> };

/** Parses a form into a transaction, or the first error per field. */
export function parseTransactionForm(formData: FormData): ParsedTransaction {
  const parsed = transactionSchema.safeParse(readTransactionForm(formData));
  if (parsed.success) return { ok: true, value: parsed.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "form";
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return { ok: false, fieldErrors };
}

/**
 * The wire shape for a queued entry.
 *
 * `clientUuid` is generated on the device and carried through to the database's
 * unique (user_id, client_uuid) index, which is what makes replaying the queue
 * safe: a flush that half-succeeded and is retried inserts nothing twice.
 */
export type QueuedTransaction = TransactionInput & { clientUuid: string };

export function withClientUuid(
  value: TransactionInput,
  uuid: string = crypto.randomUUID(),
): QueuedTransaction {
  return { ...value, clientUuid: value.clientUuid ?? uuid };
}
