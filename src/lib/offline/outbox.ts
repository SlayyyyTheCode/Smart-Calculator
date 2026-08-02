"use client";

import Dexie, { type EntityTable } from "dexie";

import type { QueuedTransaction } from "@/lib/transactions/payload";

export type OutboxEntry = {
  id: number;
  clientUuid: string;
  payload: QueuedTransaction;
  createdAt: string;
  attempts: number;
  lastError: string | null;
};

/**
 * The outbox: entries recorded on this device that the server has not accepted
 * yet.
 *
 * Only writes are queued. Reading the app offline shows whatever the service
 * worker last cached, and stale figures are clearly marked rather than silently
 * served as current — but an expense you typed must never be lost just because
 * a train went into a tunnel.
 */
class OutboxDatabase extends Dexie {
  entries!: EntityTable<OutboxEntry, "id">;

  constructor() {
    super("smart-planner-outbox");
    this.version(1).stores({
      // clientUuid is unique: the same entry can only be queued once.
      entries: "++id, &clientUuid, createdAt",
    });
  }
}

let database: OutboxDatabase | null = null;

/** IndexedDB only exists in the browser, so the handle is created lazily. */
function db(): OutboxDatabase {
  if (!database) database = new OutboxDatabase();
  return database;
}

export const OUTBOX_CHANGED = "smart-planner:outbox-changed";

function announce() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED));
  }
}

export async function enqueue(payload: QueuedTransaction): Promise<void> {
  await db().entries.add({
    clientUuid: payload.clientUuid,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  } as OutboxEntry);
  announce();
}

export async function listQueued(): Promise<OutboxEntry[]> {
  return db().entries.orderBy("createdAt").toArray();
}

export async function countQueued(): Promise<number> {
  return db().entries.count();
}

export async function removeQueued(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db().entries.bulkDelete(ids);
  announce();
}

/**
 * Records a failed attempt without dropping the entry. An entry the server
 * rejects outright still keeps its error, so the queue can show why rather than
 * retrying forever in silence.
 */
export async function markFailed(ids: number[], message: string): Promise<void> {
  await db().entries.where("id").anyOf(ids).modify((entry) => {
    entry.attempts += 1;
    entry.lastError = message;
  });
  announce();
}

export async function clearQueued(): Promise<void> {
  await db().entries.clear();
  announce();
}
