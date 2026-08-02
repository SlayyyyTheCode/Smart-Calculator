"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * Registration is skipped in development: a worker that outlives a hot reload
 * serves yesterday's bundle and turns every subsequent change into a mystery.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // A failed registration costs offline support, nothing else. The app
        // works; there is nothing useful to say to the user about it.
      });
    };

    // Registering after load keeps the worker's own fetches from competing
    // with the ones rendering the page.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

/**
 * Drops cached pages. Called on sign-out, because a cached screen is HTML
 * belonging to whoever was signed in when it was cached, and the next person
 * to use the device must not be shown it.
 */
export async function clearOfflineCaches(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration();
  registration?.active?.postMessage({ type: "CLEAR_CACHES" });

  // Also clear directly, in case no worker is controlling this page yet.
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith("smart-planner-")).map((name) => caches.delete(name)),
    );
  }
}
