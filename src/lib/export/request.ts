import { NextResponse, type NextRequest } from "next/server";

import { monthsBetween, startOfMonth, type IsoDate } from "@/lib/date";
import { getCurrentUser } from "@/lib/supabase/server";

export type ExportRangeResult = { from: IsoDate; to: IsoDate } | { error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads and bounds the ?from= and ?to= parameters of an export request.
 *
 * A range is capped at 60 months. Exports are synchronous and hold a whole
 * workbook in memory, so an unbounded range is a way to take the process down;
 * the cap turns that into a 400.
 */
export function readExportRange(request: NextRequest, maxMonths = 60): ExportRangeResult {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !ISO_DATE.test(from) || !to || !ISO_DATE.test(to)) {
    return { error: "Provide from and to as YYYY-MM-DD dates." };
  }

  const start = startOfMonth(from);
  const end = startOfMonth(to);
  const months = monthsBetween(start, end, maxMonths + 1);

  if (months.length === 0) {
    return { error: "The end month must not be before the start month." };
  }
  if (months.length > maxMonths) {
    return { error: `Ranges are limited to ${maxMonths} months.` };
  }

  return { from: start, to: end };
}

/**
 * Rejects an unauthenticated export request.
 *
 * The proxy already redirects anonymous visitors, and RLS would return an empty
 * file rather than someone else's data. This is the third layer: route handlers
 * sit behind no layout, so if the proxy matcher is ever edited, an anonymous
 * request would otherwise get a silent empty workbook instead of a 401.
 *
 * Returns null when the caller is signed in, or the response to send back.
 */
export async function rejectAnonymousExport(): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  if (user) return null;
  return NextResponse.json({ error: "Sign in to export your data." }, { status: 401 });
}
