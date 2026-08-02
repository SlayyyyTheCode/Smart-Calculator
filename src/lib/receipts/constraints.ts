/**
 * The receipts bucket's limits.
 *
 * Kept in their own module with no imports, because both the browser and the
 * server need them: the upload control rejects an oversized file before sending
 * it, and Storage enforces the same limits on arrival. Putting these beside the
 * server-side signing helper would drag `next/headers` into the client bundle.
 *
 * These mirror the bucket created in supabase/migrations/0005_storage.sql. If
 * you change one, change both.
 */

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export const RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;
