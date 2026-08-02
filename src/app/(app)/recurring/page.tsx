import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";

export const metadata: Metadata = { title: "Fixed & recurring" };

export default function RecurringPage() {
  return (
    <>
      <PageHeader
        title="Fixed & recurring"
        description="Monthly commitments, kept in two separate buckets."
      />
      <PhaseNotice phase="phase 2">
        <p>
          <strong className="text-foreground">Fixed</strong> covers anything billed at the same
          amount every period — rent, insurance, a loan payment. A nightly job posts these for you.
        </p>
        <p className="mt-2">
          <strong className="text-foreground">Recurring</strong> covers what repeats but varies —
          electricity, groceries, fuel. The job posts a draft using your estimate, and you confirm
          it with the real figure when the bill arrives. Drafts stay out of every total until then.
        </p>
      </PhaseNotice>
    </>
  );
}
