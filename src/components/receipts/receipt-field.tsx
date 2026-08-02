"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { attachReceipt } from "@/lib/actions/receipts";
import { RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES } from "@/lib/receipts/constraints";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type ReceiptFieldProps = {
  transactionId: string;
  /** Signed URL for the receipt already attached, if there is one. */
  receiptUrl: string | null;
  isPdf: boolean;
};

/** Keeps the stored name predictable and free of anything path-like. */
function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned.slice(-80) || "receipt";
}

/**
 * Attaches a photo or PDF to a transaction.
 *
 * The file goes directly from here to Supabase Storage. A server action would
 * be the obvious route, but its request body is capped at a megabyte and a
 * phone photo is usually several — so the bytes take the short path, and only
 * the resulting object path is sent to the server to record.
 */
export function ReceiptField({ transactionId, receiptUrl, isPdf }: ReceiptFieldProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();

  async function upload(file: File) {
    setError(null);

    if (file.size > RECEIPT_MAX_BYTES) {
      setError("That file is larger than 10 MB.");
      return;
    }
    // A file picked on some platforms arrives with an empty type; Storage
    // enforces the same list on arrival, so an unknown type is let through.
    if (file.type && !(RECEIPT_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError("Attach a photo (JPEG, PNG, WebP or HEIC) or a PDF.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Your session has expired. Sign in again.");
        return;
      }

      // The path's first segment is what Storage's policies match on, so it
      // must be the user's own id.
      const path = `${user.id}/${transactionId}/${Date.now()}-${safeName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const result = await attachReceipt(transactionId, path);
      if (result.status === "error") {
        setError(result.message ?? "Could not attach that receipt.");
        // The row was not updated, so the object would be orphaned.
        await supabase.storage.from("receipts").remove([path]);
        return;
      }

      startTransition(() => router.refresh());
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Receipt</p>

      {receiptUrl ? (
        <div className="flex items-center gap-3 rounded-lg border border-border p-2">
          {isPdf ? (
            <span className="flex size-16 items-center justify-center rounded bg-surface-muted text-muted-foreground">
              <FileText className="size-6" aria-hidden />
            </span>
          ) : (
            // Signed URLs are per-request and short-lived, so they cannot be
            // put through the image optimiser's cache.
            <Image
              src={receiptUrl}
              alt="Attached receipt"
              width={64}
              height={64}
              unoptimized
              className="size-16 rounded object-cover"
            />
          )}
          <a
            href={receiptUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-sm text-accent hover:underline"
          >
            View full size
          </a>
        </div>
      ) : (
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-muted",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <Paperclip className="size-4" aria-hidden />
          {uploading ? "Uploading…" : "Attach a photo or PDF"}
          <input
            type="file"
            accept={RECEIPT_MIME_TYPES.join(",")}
            capture="environment"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
      )}

      {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}

/** Detach button, kept separate so it can sit in its own server-rendered form. */
export function RemoveReceiptButton() {
  return (
    <Button type="submit" variant="ghost" size="sm">
      <Trash2 aria-hidden />
      Remove receipt
    </Button>
  );
}
