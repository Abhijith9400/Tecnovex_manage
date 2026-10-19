import { Suspense } from "react";
import { Spinner } from "@/components/ui/Feedback";
import { InvoiceDetail } from "@/features/invoices/InvoiceDetail";

export default function InvoiceDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <InvoiceDetail />
    </Suspense>
  );
}
