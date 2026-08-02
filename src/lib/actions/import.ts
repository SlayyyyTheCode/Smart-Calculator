"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionState } from "@/lib/actions/result";
import { toMajorString } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];

function revalidateImportViews() {
  revalidatePath("/import");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}

/**
 * The rows the client offers for import.
 *
 * Validated here rather than trusted: the mapping and parsing happen in the
 * browser so the preview is instant, which means what arrives is
 * user-controllable and gets the same scrutiny as any other input.
 */
const importedTransactionSchema = z.object({
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int().positive(),
  direction: z.enum(["expense", "income"]),
  expenseNature: z.enum(["daily", "fixed", "recurring"]).nullable(),
  incomeType: z.enum(["active", "passive"]).nullable(),
  merchant: z.string().max(120).nullable(),
  note: z.string().max(500).nullable(),
  categoryId: z.uuid().nullable(),
  accountId: z.uuid().nullable(),
});

const commitSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  source: z.string().trim().max(60).nullish(),
  // Bounded so one request cannot be used to exhaust memory.
  transactions: z.array(importedTransactionSchema).min(1).max(2000),
});

export type CommitImportInput = z.infer<typeof commitSchema>;

/**
 * Writes an imported file as one batch.
 *
 * Every row carries the batch id, which is what makes the import reversible in
 * a single action later — an import that cannot be undone is one nobody dares
 * run against real data.
 */
export async function commitImport(input: CommitImportInput): Promise<ActionState> {
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That import could not be read.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      user_id: user.id,
      filename: parsed.data.filename,
      source: parsed.data.source ?? null,
      row_count: parsed.data.transactions.length,
      status: "pending",
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    return fail(batchError?.message ?? "Could not start the import.");
  }

  const rows: TransactionInsert[] = parsed.data.transactions.map((transaction) => ({
    user_id: user.id,
    occurred_on: transaction.occurredOn,
    amount: Number(toMajorString(transaction.amount)),
    direction: transaction.direction,
    income_type: transaction.incomeType,
    expense_nature: transaction.expenseNature,
    merchant: transaction.merchant,
    note: transaction.note,
    category_id: transaction.categoryId,
    account_id: transaction.accountId,
    import_batch_id: batch.id,
  }));

  const { error: insertError } = await supabase.from("transactions").insert(rows);

  if (insertError) {
    // Leave no half-finished batch behind: the rows failed, so the batch that
    // was meant to hold them should not linger looking successful.
    await supabase.from("import_batches").delete().eq("id", batch.id);
    return fail(insertError.message);
  }

  const { error: statusError } = await supabase
    .from("import_batches")
    .update({ status: "committed" })
    .eq("id", batch.id);

  if (statusError) return fail(statusError.message);

  revalidateImportViews();
  return ok(`Imported ${rows.length} ${rows.length === 1 ? "entry" : "entries"}.`);
}

/**
 * Undoes an import.
 *
 * Deletes only the rows that import created, identified by the batch id, and
 * keeps the batch record marked as reverted so the history of what was tried
 * survives.
 */
export async function revertImport(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return;

  const supabase = await createClient();

  const { error } = await supabase.from("transactions").delete().eq("import_batch_id", id);
  if (error) return;

  await supabase.from("import_batches").update({ status: "reverted" }).eq("id", id);

  revalidateImportViews();
}
