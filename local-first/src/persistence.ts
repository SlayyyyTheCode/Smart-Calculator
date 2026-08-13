import { useEffect, useState } from "react";

/**
 * Asking the browser not to throw the database away.
 *
 * OPFS is "best effort" storage by default. Under disk pressure a browser may
 * evict it, and for this app that is not a cache miss — it is a year of
 * somebody's finances, gone, with no server copy to restore from because having
 * no server copy is the entire design.
 *
 * `navigator.storage.persist()` asks for the durable tier. Browsers decide for
 * themselves: an installed PWA or a site the user engages with is usually
 * granted it silently, a page opened once may be refused. Refusal is not an
 * error and must not be treated as one — the app works either way. It is a risk
 * worth showing the user rather than a failure worth interrupting them about.
 *
 * Capacitor builds are not subject to this at all; the native container's files
 * are the app's own. It matters for the installable web version.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function usePersistence(): boolean | null {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void requestPersistence().then((result) => {
      if (alive) setGranted(result);
    });
    return () => {
      alive = false;
    };
  }, []);
  return granted;
}
