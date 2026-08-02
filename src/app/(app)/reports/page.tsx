import type { Metadata } from "next";
import { FileSpreadsheet, FileText } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ExportForm } from "@/components/reports/export-form";
import { getFormatting } from "@/lib/data/profile";
import { addMonths, startOfMonth, todayIso } from "@/lib/date";

export const metadata: Metadata = { title: "Reports & export" };

export default async function ReportsPage() {
  const formatting = await getFormatting();
  const currentMonth = startOfMonth(todayIso(formatting.timezone));

  // 24 months back and 2 forward: enough to cover a full history without
  // making the pickers unwieldy.
  const months = Array.from({ length: 27 }, (_, index) => addMonths(currentMonth, 2 - index));

  return (
    <>
      <PageHeader
        title="Reports & export"
        description="Take your data out as a spreadsheet you can work in, or a report you can file."
      />

      <Card>
        <CardHeader>
          <CardTitle>Export a range</CardTitle>
          <CardDescription>
            Whole months only. Both formats cover the same range and the same figures.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportForm
            months={months}
            defaultFrom={addMonths(currentMonth, -5)}
            defaultTo={currentMonth}
            locale={formatting.locale}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
              Excel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">One worksheet per month</span>, named{" "}
              <code className="rounded bg-surface-muted px-1">2026-01</code> and so on, each with
              every transaction, a totals block and budget against actual.
            </p>
            <p>
              A <span className="font-medium text-foreground">Summary</span> sheet carries the
              whole range month by month, and a{" "}
              <span className="font-medium text-foreground">Categories</span> sheet totals your
              spending across it.
            </p>
            <p>
              Amounts are written as numbers with a currency format, not as text, so you can sum,
              sort and chart them once the file is open.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" aria-hidden />
              PDF
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              A <span className="font-medium text-foreground">page per month</span>: the headline
              figures, your budgets with their status, where the money went, and the full
              transaction table.
            </p>
            <p>
              Budget status is written as a word as well as a colour, so it survives a greyscale
              print.
            </p>
            <p>Limited to 24 months per report.</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        Both exports list draft entries forecast from your recurring rules, marked as drafts, and
        exclude them from every total — matching what you see on screen.
      </p>
    </>
  );
}
