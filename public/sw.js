/**
 * Smart Planner service worker.
 *
 * Written by hand rather than generated. The bundler-integrated options do not
 * support Turbopack, which Next 16 builds with, and would have silently
 * produced no worker at all; the job here is small enough that owning it
 * outright is simpler than depending on that being fixed.
 *
 * What it does, and deliberately no more:
 *
 *   - Keeps the quick add screen openable with no connection, so an expense can
 *     still be recorded. The entry itself is protected by the outbox in
 *     IndexedDB, not by this file.
 *   - Serves a page that explains itself, instead of the browser's error, when
 *     a screen that needs the network is opened offline.
 *   - Serves content-hashed build assets from cache, because their URL changes
 *     whenever their content does.
 *
 * What it will not do: cache API responses or data payloads. A stale balance
 * presented as current is worse than no balance at all.
 *
 * Cached pages are user-specific HTML, so the caches are cleared on sign-out —
 * see CLEAR_CACHES below.
 */

const VERSION = "v1";
const SHELL_CACHE = `smart-planner-shell-${VERSION}`;
const ASSET_CACHE = `smart-planner-assets-${VERSION}`;
const PAGE_CACHE = `smart-planner-pages-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, PAGE_CACHE];

/** Precached at install: everything needed to render the offline fallback. */
const SHELL_URLS = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png"];

/** Pages worth keeping so they open with no connection. */
const OFFLINE_CAPABLE_PAGES = ["/quick-add"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one missing URL cannot fail the whole install.
      await Promise.all(
        SHELL_URLS.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("smart-planner-") && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Sign-out clears the cached pages, which are specific to the signed-in user. */
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_CACHES") return;
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("smart-planner-")).map((name) => caches.delete(name)),
      );
      // Put the offline fallback back so it still works after signing out.
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => undefined)));
    })(),
  );
});

function isBuildAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

function isOfflineCapablePage(url) {
  return OFFLINE_CAPABLE_PAGES.some(
    (page) => url.pathname === page || url.pathname.startsWith(`${page}/`),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache anything under /api or the auth flow. Those are either data or
  // a one-time code exchange, and both are wrong to replay.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Build assets are content-hashed, so a cache hit is always correct.
  if (isBuildAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  if (request.mode !== "navigate") return;

  // Pages: always try the network first, so figures are never stale when a
  // connection exists. Only fall back to a cached copy when it fails.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok && isOfflineCapablePage(url)) {
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;

        const offline = await caches.match("/offline");
        if (offline) return offline;

        return new Response("You are offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }
    })(),
  );
});
