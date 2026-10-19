"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { RequireRole } from "@/features/auth/RequireRole";
import { InvoiceList } from "@/features/invoices/InvoiceList";
import { roleGroups } from "@/lib/navigation";

export default function InvoicesPage() {
  return (
    <RequireRole roles={roleGroups.FINANCE}>
      <PageHeader title="Invoices" description="Create, issue and track invoices. Totals are always calculated by the server from the saved line items." />
      <InvoiceList />
    </RequireRole>
  );
}
