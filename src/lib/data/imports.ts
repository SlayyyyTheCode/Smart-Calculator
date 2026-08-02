import { createClient } from "@/lib/supabase/server";
import type { ImportStatus } from "@/types/database";

export type ImportBatchItem = {
  id: string;
  filename: string;
  source: string | null;
  rowCount: number;
  status: ImportStatus;
  createdAt: string;
  /** How many of the rows it created are still there. */
  remaining: number;
};

/** Recent imports, newest first, with what is left of each. */
export async function listImportBatches(limit = 10): Promise<ImportBatchItem[]> {
  const supabase = await createClient();

  const { data: batches } = await supabase
    .from("import_batches")
    .select("id, filename, source, row_count, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!batches || batches.length === 0) return [];

  // Counting per batch keeps the reverted state honest even if rows were
  // deleted one by one from the transaction list.
  const counts = await Promise.all(
    batches.map(async (batch) => {
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("import_batch_id", batch.id);
      return count ?? 0;
    }),
  );

  return batches.map((batch, index) => ({
    id: batch.id,
    filename: batch.filename,
    source: batch.source,
    rowCount: batch.row_count,
    status: batch.status,
    createdAt: batch.created_at,
    remaining: counts[index],
  }));
}
