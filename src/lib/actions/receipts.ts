"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionState } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";

const RECEIPT_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/;

/**
 * Records the receipt a client just uploaded against its transaction.
 *
 * The file itself goes straight from the browser to Storage rather than through
 * this server: a server action caps its request body at a megabyte, and photos
 * are routinely larger. Storage has its own row level security keyed on the
 * first path segment, so the upload is protected there, and this only writes
 * down where it landed.
 *
 * The path is still checked, because it arrives from the client: it must be
 * {user_id}/{transaction_id}/{filename}, and the user id must be this user's.
 */
export async function attachReceipt(
  transactionId: string,
  path: string,
): Promise<ActionState> {
  if (!RECEIPT_PATH.test(path)) {
    return fail("That receipt path is not one this app would have created.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const [ownerId, pathTransactionId] = path.split("/");
  if (ownerId !== user.id) {
    return fail("That receipt belongs to a different account.");
  }
  if (pathTransactionId !== transactionId) {
    return fail("That receipt was uploaded for a different entry.");
  }

  // RLS confines the update to this user's rows regardless of the id sent.
  const { error } = await supabase
    .from("transactions")
    .update({ receipt_path: path })
    .eq("id", transactionId);

  if (error) return fail(error.message);

  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/transactions");
  return ok("Receipt attached.");
}

/** Detaches and deletes a receipt. */
export async function removeReceipt(formData: FormData): Promise<void> {
  const transactionId = formData.get("transactionId");
  if (typeof transactionId !== "string" || transactionId === "") return;

  const supabase = await createClient();

  const { data: transaction } = await supabase
    .from("transactions")
    .select("receipt_path")
    .eq("id", transactionId)
    .maybeSingle();

  if (transaction?.receipt_path) {
    // Clear the reference first. If the object delete fails, the app is
    // consistent with an orphaned file, rather than pointing at a file that
    // has gone.
    await supabase.from("transactions").update({ receipt_path: null }).eq("id", transactionId);
    await supabase.storage.from("receipts").remove([transaction.receipt_path]);
  }

  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/transactions");
}
