import { NextResponse, type NextRequest } from "next/server";

import { getExportPayload } from "@/lib/data/export";
import { buildPdf } from "@/lib/export/pdf";
import { readExportRange, rejectAnonymousExport } from "@/lib/export/request";
import { exportFilename } from "@/lib/export/shared";

// @react-pdf/renderer needs Node APIs, so this route is not edge-compatible.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const range = readExportRange(request, 24);
  if ("error" in range) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  const anonymous = await rejectAnonymousExport();
  if (anonymous) return anonymous;

  try {
    const payload = await getExportPayload(range.from, range.to);
    const pdf = await buildPdf(payload);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${exportFilename(payload.from, payload.to, "pdf")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
