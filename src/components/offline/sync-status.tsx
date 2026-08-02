"use client";

import { CloudOff, RefreshCw, UploadCloud } from "lucide-react";

import { useOutbox } from "@/lib/offline/use-outbox";
import { cn } from "@/lib/utils";

/**
 * Says whether anything you have recorded is still only on this device.
 *
 * Silent when online with an empty queue — a permanent "everything is fine"
 * badge is noise, and it trains people to ignore the spot where the real
 * warning will appear.
 */
export function SyncStatus({ className }: { className?: string }) {
  const { pending, online, syncing, sync } = useOutbox();

  if (online && pending === 0) return null;

  if (!online) {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400",
          className,
        )}
      >
        <CloudOff className="size-3.5" aria-hidden />
        Offline
        {pending > 0 ? <span aria-label={`${pending} entries waiting`}>· {pending}</span> : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void sync()}
      disabled={syncing}
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20",
        className,
      )}
    >
      {syncing ? (
        <RefreshCw className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <UploadCloud className="size-3.5" aria-hidden />
      )}
      {syncing ? "Syncing…" : `${pending} to sync`}
    </button>
  );
}
