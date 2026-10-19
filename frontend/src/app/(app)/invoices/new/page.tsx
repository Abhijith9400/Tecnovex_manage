"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/Feedback";
import { RequireRole } from "@/features/auth/RequireRole";
import { InvoiceEditor } from "@/features/invoices/InvoiceEditor";
import { roleGroups } from "@/lib/navigation";

function NewInvoice() {
  const params = useSearchParams();
  return <InvoiceEditor initialClientId={params.get("clientId") ?? undefined} />;
}

export default function NewInvoicePage() {
  return (
    <RequireRole roles={roleGroups.FINANCE}>
      <Suspense fallback={<Spinner />}>
        <NewInvoice />
      </Suspense>
    </RequireRole>
  );
}
