"use client";

import { useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  syncNow,
  type OutboxSnapshot,
} from "@/lib/offline/store";

export type { OutboxSnapshot };

/** Current outbox state, plus a way to retry by hand. */
export function useOutbox() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...snapshot, sync: syncNow };
}
