import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";

export const metadata: Metadata = { title: "Reports & export" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports & export"
        description="Take your data out as a spreadsheet or a printable report."
      />
      <PhaseNotice phase="phase 4">
        <p>
          <strong className="text-foreground">Excel</strong> — one worksheet per month, each with
          every transaction, a totals row and a budget-versus-actual block, plus a summary sheet
          covering the whole range.
        </p>
        <p className="mt-2">
          <strong className="text-foreground">PDF</strong> — a monthly report with the headline
          figures, any budget warnings, the category breakdown and the transaction table.
        </p>
      </PhaseNotice>
    </>
  );
}
