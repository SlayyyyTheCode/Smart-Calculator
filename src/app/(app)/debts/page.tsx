import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";

export const metadata: Metadata = { title: "Debts" };

export default function DebtsPage() {
  return (
    <>
      <PageHeader title="Debts" description="Loans, interest and payoff timelines." />
      <PhaseNotice phase="phase 7">
        Balance, APR and minimum payment per debt, with a projected payoff date and the interest
        cost of paying the minimum versus paying more.
      </PhaseNotice>
    </>
  );
}
