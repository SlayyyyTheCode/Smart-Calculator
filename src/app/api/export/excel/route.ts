import { NextResponse, type NextRequest } from "next/server";

import { getExportPayload } from "@/lib/data/export";
import { buildWorkbook } from "@/lib/export/excel";
import { exportFilename } from "@/lib/export/shared";
import { readExportRange, rejectAnonymousExport } from "@/lib/export/request";

// exceljs is a Node library; it cannot run on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const range = readExportRange(request);
  if ("error" in range) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  const anonymous = await rejectAnonymousExport();
  if (anonymous) return anonymous;

  try {
    // Runs as the signed-in user, so RLS decides what is in the file.
    const payload = await getExportPayload(range.from, range.to);
    const workbook = await buildWorkbook(payload);

    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename(payload.from, payload.to, "xlsx")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the workbook.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
