import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PhaseNotice } from "@/components/ui/phase-notice";

export const metadata: Metadata = { title: "Net worth" };

export default function NetWorthPage() {
  return (
    <>
      <PageHeader
        title="Net worth"
        description="What you own minus what you owe, tracked over time."
      />
      <PhaseNotice phase="phase 7">
        Assets you record here plus your account balances, less your outstanding debts, snapshotted
        monthly so the line has history rather than only a current figure.
      </PhaseNotice>
    </>
  );
}
