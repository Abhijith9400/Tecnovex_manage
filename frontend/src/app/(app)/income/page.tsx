"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Feedback";
import { RequireRole } from "@/features/auth/RequireRole";
import { CashEntries } from "@/features/expenses/CashEntries";
import { roleGroups } from "@/lib/navigation";

export default function IncomePage() {
  return (
    <RequireRole roles={roleGroups.FINANCE}>
      <PageHeader title="Other Income" description="Interest, refunds, grants and other receipts that are not client invoice payments." />
      <div className="mb-4">
        <Alert variant="info">Client invoice collections are recorded under Payments and are already counted in reports. Do not enter them here; matching transaction references are blocked.</Alert>
      </div>
      <CashEntries kind="income" />
    </RequireRole>
  );
}
