import { createClient } from "@/lib/supabase/server";

/** How long a receipt link stays valid. Long enough to view, short enough not to leak. */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * A temporary link to a receipt.
 *
 * The bucket is private, so there is no public URL to hand out. A signed URL is
 * minted per request and expires, which means a link copied out of the page is
 * useless within minutes rather than forever.
 */
export async function getReceiptUrl(path: string | null): Promise<string | null> {
  if (!path) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("receipts")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) return null;
  return data?.signedUrl ?? null;
}
