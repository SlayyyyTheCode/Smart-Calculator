import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage() {
  return (
    <>
      <PageHeader
        title="Budgets"
        description="Pre-define what you intend to spend each month, and get told before you break it."
      />
      <PhaseNotice phase="phase 2">
        A cap per category plus an overall monthly cap, each with its own warning threshold
        (80% by default). Anything at or past the threshold turns amber, anything at or past the
        limit turns red — on this page, on the dashboard, and inline while you are entering the
        expense that would push you over.
      </PhaseNotice>
    </>
  );
}
