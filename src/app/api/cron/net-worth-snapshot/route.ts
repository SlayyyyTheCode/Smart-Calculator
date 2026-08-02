import { NextResponse, type NextRequest } from "next/server";

import { rejectUnauthorizedCron } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records one net worth snapshot per user per month.
 *
 * Phase 7 fills in the body: sum each user's assets and liquid account
 * balances, subtract their outstanding debts, and upsert a row keyed on
 * (user_id, as_of) so a re-run overwrites rather than duplicates.
 */
export async function GET(request: NextRequest) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json({
    ok: true,
    snapshots: 0,
    note: "Snapshots land in phase 7.",
  });
}
