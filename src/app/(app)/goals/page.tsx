import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <>
      <PageHeader
        title="Goals"
        description="Save toward a target amount by a target date."
      />
      <PhaseNotice phase="phase 7">
        Sinking funds with progress bars and the monthly contribution needed to land on time.
      </PhaseNotice>
    </>
  );
}
