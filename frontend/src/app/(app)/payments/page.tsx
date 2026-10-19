"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { RequireRole } from "@/features/auth/RequireRole";
import { PaymentList } from "@/features/payments/PaymentList";
import { roleGroups } from "@/lib/navigation";

export default function PaymentsPage() {
  return (
    <RequireRole roles={roleGroups.FINANCE}>
      <PageHeader title="Payments" description="Client payments received, with receipts. Voided payments stay on record for the audit trail." />
      <PaymentList />
    </RequireRole>
  );
}
