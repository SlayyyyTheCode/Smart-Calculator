import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Runs before every matched request: refreshes the Supabase auth cookie and
 * sends anonymous visitors to /login.
 *
 * This is the `proxy` file convention that replaced `middleware` in Next 16.
 */
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, static assets and the service worker.
     * Cron routes are excluded too: they authenticate with CRON_SECRET, not a
     * user session, so the auth redirect must not touch them.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
