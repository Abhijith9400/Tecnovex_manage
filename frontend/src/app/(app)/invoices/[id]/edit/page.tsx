"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { Alert, Spinner } from "@/components/ui/Feedback";
import { RequireRole } from "@/features/auth/RequireRole";
import { InvoiceEditor } from "@/features/invoices/InvoiceEditor";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { roleGroups } from "@/lib/navigation";
import type { Invoice } from "@/types/models";

function EditInvoice() {
  const { id } = useParams<{ id: string }>();
  const invoice = useAsync(() => api.get<Invoice>(`/invoices/${id}`), [id]);
  if (invoice.error) return <Alert>{invoice.error}</Alert>;
  if (!invoice.data) return <Spinner />;
  if (invoice.data.status !== "DRAFT") return <Alert>Only draft invoices can be edited. Use Revise on the invoice page to correct an issued invoice.</Alert>;
  return <InvoiceEditor invoice={invoice.data} />;
}

export default function EditInvoicePage() {
  return (
    <RequireRole roles={roleGroups.FINANCE}>
      <Suspense fallback={<Spinner />}>
        <EditInvoice />
      </Suspense>
    </RequireRole>
  );
}
