import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";

export const metadata: Metadata = { title: "Quick add" };

export default function QuickAddPage() {
  return (
    <>
      <PageHeader
        title="Quick add"
        description="Record an expense the moment you make it — amount, category, done."
      />
      <PhaseNotice phase="phase 1">
        A numeric keypad, your most-used categories as one-tap chips, and a date that defaults to
        today. Expenses are tagged daily, fixed or recurring; income is tagged active or passive.
        Phase 5 adds an offline queue so an entry made with no signal syncs when you reconnect.
      </PhaseNotice>
    </>
  );
}
