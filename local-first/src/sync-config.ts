/**
 * Whether this device syncs, and under which owner.
 *
 * Deliberately in localStorage rather than in the database: it describes *this
 * device*, not the account. A phone that has been unpaired should stop syncing
 * without that decision travelling to the other devices and unpairing them too.
 *
 * The mnemonic is the encryption key. It is held here because the device has to
 * be able to open its own database after a restart, which is the same reason a
 * password manager holds a key locally. It never goes to the relay: the relay
 * only ever sees an owner id and ciphertext.
 */

const KEY = "smart-planner.sync";

export type SyncConfig = {
  mnemonic: string;
  relayUrl: string;
  /**
   * True once this device's database belongs to this mnemonic.
   *
   * Set immediately when the device turns sync on with its own existing owner —
   * nothing needs to happen, the data is already there. Left false when a
   * recovery phrase is entered from another device, which is the signal to run
   * `restoreAppOwner` on the next load: that wipes this device's database and
   * pulls down the other one's.
   *
   * Deriving this by comparing mnemonics does not work, because both cases look
   * identical afterwards. The difference is intent, so intent is what gets
   * recorded.
   */
  adopted: boolean;
};

export function readSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    if (typeof parsed.mnemonic !== "string" || typeof parsed.relayUrl !== "string") return null;
    return {
      mnemonic: parsed.mnemonic,
      relayUrl: parsed.relayUrl,
      // Absent means "not yet adopted", so an older entry restores rather than
      // silently assuming this device already holds the data.
      adopted: parsed.adopted === true,
    };
  } catch {
    // A corrupt entry must not brick the app. Sync off is always a safe state:
    // the data is still on the device either way.
    return null;
  }
}

export function writeSyncConfig(config: SyncConfig): void {
  localStorage.setItem(KEY, JSON.stringify(config));
}

export function clearSyncConfig(): void {
  localStorage.removeItem(KEY);
}

export const DEFAULT_RELAY = "ws://localhost:4000";
