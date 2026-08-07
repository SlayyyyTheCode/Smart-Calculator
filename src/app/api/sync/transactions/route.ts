import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { toMajorString } from "@/lib/money";
import { queuedTransactionSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enough for a long trip with no signal, small enough to bound one request. */
const MAX_BATCH = 200;

/**
 * Accepts entries recorded while the device was offline.
 *
 * Every entry is validated here. The queue lives in the browser, so its
 * contents are user-controllable and are treated as untrusted input, not as
 * something already checked on the way in.
 *
 * Validation uses `queuedTransactionSchema`, not the form's
 * `transactionSchema`. They differ in one field and it matters: a form sends
 * an amount in major units to be parsed, while a queued entry was parsed on
 * the device and arrives in minor units. Parsing it again multiplies it by a
 * hundred.
 *
 * The reply names which entries were accepted and why any were rejected, so the
 * client can clear exactly those and keep the rest with a reason attached
 * rather than retrying a permanently invalid entry forever.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to sync." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const transactions = (body as { transactions?: unknown })?.transactions;
  if (!Array.isArray(transactions)) {
    return NextResponse.json({ error: "Expected a transactions array." }, { status: 400 });
  }
  if (transactions.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Send at most ${MAX_BATCH} entries per request.` },
      { status: 400 },
    );
  }

  const rejected: Record<string, string> = {};
  const rows: TransactionInsert[] = [];

  for (const candidate of transactions) {
    const clientUuid = (candidate as { clientUuid?: unknown })?.clientUuid;
    if (typeof clientUuid !== "string" || clientUuid === "") {
      // With no id there is nothing to report against, so it is dropped.
      continue;
    }

    const parsed = queuedTransactionSchema.safeParse(candidate);
    if (!parsed.success) {
      rejected[clientUuid] = parsed.error.issues[0]?.message ?? "Invalid entry.";
      continue;
    }

    const input = parsed.data;
    rows.push({
      user_id: user.id,
      occurred_on: input.occurredOn,
      amount: Number(toMajorString(input.amount)),
      direction: input.direction,
      income_type: input.incomeType ?? null,
      expense_nature: input.expenseNature ?? null,
      category_id: input.categoryId ?? null,
      account_id: input.accountId ?? null,
      merchant: input.merchant ?? null,
      note: input.note ?? null,
      tags: input.tags,
      client_uuid: clientUuid,
    });
  }

  if (rows.length > 0) {
    // The unique (user_id, client_uuid) index makes this idempotent: a flush
    // that half-succeeded and is retried inserts nothing twice.
    const { error } = await supabase
      .from("transactions")
      .upsert(rows, { onConflict: "user_id,client_uuid", ignoreDuplicates: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    revalidatePath("/quick-add");
  }

  return NextResponse.json({
    // Duplicates count as accepted: the row is already there, which is what the
    // client wanted, so the entry should leave the queue.
    accepted: rows.map((row) => row.client_uuid),
    rejected,
  });
}
