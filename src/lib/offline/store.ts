"use client";

import { OUTBOX_CHANGED, countQueued } from "@/lib/offline/outbox";
import { flushOutbox } from "@/lib/offline/sync";

export type OutboxSnapshot = {
  pending: number;
  online: boolean;
  syncing: boolean;
  lastError: string | null;
};

/**
 * The outbox as an external store.
 *
 * IndexedDB and `navigator.onLine` are outside React, so this is a real
 * external source rather than derived state — which is exactly what
 * useSyncExternalStore is for. Doing it with an effect that seeds state on
 * mount would mean every component holding its own copy, drifting apart.
 *
 * Flushing is triggered by coming back online and by the tab regaining focus,
 * which are the moments connectivity actually changes. A timer would spend
 * battery being wrong most of the time.
 */

const SERVER_SNAPSHOT: OutboxSnapshot = {
  pending: 0,
  // Assume online during server render, so the first paint does not flash an
  // offline warning at someone who is not offline.
  online: true,
  syncing: false,
  lastError: null,
};

let snapshot: OutboxSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let wired = false;

function setSnapshot(patch: Partial<OutboxSnapshot>) {
  const next = { ...snapshot, ...patch };
  const unchanged = (Object.keys(next) as (keyof OutboxSnapshot)[]).every(
    (key) => next[key] === snapshot[key],
  );
  // A new object identity on every event would re-render every subscriber
  // whether or not anything moved.
  if (unchanged) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

async function refresh() {
  try {
    setSnapshot({ pending: await countQueued(), online: navigator.onLine });
  } catch {
    // No IndexedDB (private mode, or storage denied). The app still works
    // online; it just cannot queue.
    setSnapshot({ online: navigator.onLine });
  }
}

export async function syncNow(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine) return;

  setSnapshot({ syncing: true });
  const result = await flushOutbox();
  let pending = snapshot.pending;
  try {
    pending = await countQueued();
  } catch {
    /* leave the last known count */
  }
  setSnapshot({ syncing: false, lastError: result.error ?? null, pending });
}

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;

  window.addEventListener(OUTBOX_CHANGED, () => void refresh());
  window.addEventListener("offline", () => setSnapshot({ online: false }));
  window.addEventListener("online", () => {
    setSnapshot({ online: true });
    void syncNow();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void refresh();
    void syncNow();
  });

  void refresh();
  void syncNow();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  wire();
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): OutboxSnapshot {
  return snapshot;
}

export function getServerSnapshot(): OutboxSnapshot {
  return SERVER_SNAPSHOT;
}
