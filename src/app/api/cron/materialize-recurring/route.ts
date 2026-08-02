import { NextResponse, type NextRequest } from "next/server";

import { rejectUnauthorizedCron } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Posts due recurring entries.
 *
 * Phase 2 fills in the body: for every active rule, work out which occurrences
 * are due via dueOccurrences() in src/lib/domain/recurring.ts, insert a
 * confirmed transaction for `fixed` rules and a draft for `recurring` ones,
 * then advance last_materialized_on. The unique index on
 * (recurring_rule_id, occurred_on) makes a repeated run a no-op.
 *
 * The authorisation gate below is live now so the endpoint is never open.
 */
export async function GET(request: NextRequest) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json({
    ok: true,
    processed: 0,
    note: "Materialization lands in phase 2.",
  });
}
