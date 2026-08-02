import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  return (
    <>
      <PageHeader
        title="Transactions"
        description="Everything you have recorded, filtered by date, category, account or type."
      />
      <PhaseNotice phase="phase 1">
        A paged list with inline editing, filters across every dimension the schema captures, and
        bulk recategorisation. Receipts attached in phase 6 appear alongside their entry.
      </PhaseNotice>
    </>
  );
}
