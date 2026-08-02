import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Offline" };

/**
 * Shown by the service worker when a page is requested with no connection.
 * Quick add is precached and works offline, so the useful thing to offer is a
 * way back to it rather than a bare apology.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-4 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-surface-muted text-muted-foreground">
          <WifiOff className="size-5" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">You are offline</h1>
        <p className="text-sm text-muted-foreground">
          This screen needs a connection. Quick add does not — anything you record there is saved
          on your device and sent as soon as you are back online.
        </p>
        <Link
          href="/quick-add"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Go to quick add
        </Link>
      </div>
    </main>
  );
}
