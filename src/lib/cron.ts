import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { requireCronSecret } from "@/lib/env";

/**
 * Gate for the scheduled route handlers.
 *
 * These routes run with the service-role key, which bypasses RLS entirely, so
 * they must never be reachable by an anonymous request. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is rejected before a
 * single query runs.
 *
 * Returns null when the caller is authorised, or the response to send back.
 */
export function rejectUnauthorizedCron(request: NextRequest): NextResponse | null {
  let expected: string;
  try {
    expected = requireCronSecret();
  } catch {
    // No secret configured means the job is not deployable yet. Fail closed.
    return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

/** Constant-time comparison, so a wrong secret cannot be found byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
