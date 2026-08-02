import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";

export const metadata: Metadata = { title: "Income" };

export default function IncomePage() {
  return (
    <>
      <PageHeader
        title="Income"
        description="Active salary against passive dividends, coupons and rent."
      />
      <PhaseNotice phase="phase 3">
        The split between what you earn by working and what your capital earns for you, tracked
        month by month, with FIRE coverage showing how much of your spending the passive side
        already pays for. A dividend calendar for forecasting payouts follows later.
      </PhaseNotice>
    </>
  );
}
