"use client";

import { listQueued, markFailed, removeQueued } from "@/lib/offline/outbox";

export type SyncResult = {
  attempted: number;
  synced: number;
  failed: number;
  error?: string;
};

/** One flush at a time; a second caller joins the run already in progress. */
let inFlight: Promise<SyncResult> | null = null;

export function flushOutbox(): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = runFlush().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runFlush(): Promise<SyncResult> {
  const queued = await listQueued();
  if (queued.length === 0) return { attempted: 0, synced: 0, failed: 0 };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { attempted: queued.length, synced: 0, failed: 0, error: "Still offline." };
  }

  let response: Response;
  try {
    response = await fetch("/api/sync/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: queued.map((entry) => entry.payload) }),
    });
  } catch (error) {
    // A network failure is not the entry's fault; leave the queue untouched so
    // the next flush tries again.
    const message = error instanceof Error ? error.message : "Could not reach the server.";
    return { attempted: queued.length, synced: 0, failed: 0, error: message };
  }

  if (!response.ok) {
    const message = `Server responded ${response.status}.`;
    // 4xx other than auth means these entries will never be accepted as they
    // are, so the failure is recorded against them rather than retried blindly.
    if (response.status >= 400 && response.status < 500 && response.status !== 401) {
      await markFailed(
        queued.map((entry) => entry.id),
        message,
      );
    }
    return { attempted: queued.length, synced: 0, failed: queued.length, error: message };
  }

  const body = (await response.json()) as { accepted?: string[]; rejected?: Record<string, string> };
  const accepted = new Set(body.accepted ?? []);
  const rejected = body.rejected ?? {};

  const syncedIds = queued
    .filter((entry) => accepted.has(entry.clientUuid))
    .map((entry) => entry.id);
  await removeQueued(syncedIds);

  const rejectedEntries = queued.filter((entry) => entry.clientUuid in rejected);
  for (const entry of rejectedEntries) {
    await markFailed([entry.id], rejected[entry.clientUuid]);
  }

  return {
    attempted: queued.length,
    synced: syncedIds.length,
    failed: rejectedEntries.length,
  };
}
