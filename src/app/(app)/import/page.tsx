import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";

export const metadata: Metadata = { title: "Import CSV" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import CSV"
        description="Bring in a bank or broker statement instead of typing it out."
      />
      <PhaseNotice phase="phase 6">
        Upload a CSV, map its columns onto date, amount, description and category, preview what
        will be created, then commit. Each import is recorded as a batch so a bad file can be
        reverted in one action rather than row by row.
      </PhaseNotice>
    </>
  );
}
