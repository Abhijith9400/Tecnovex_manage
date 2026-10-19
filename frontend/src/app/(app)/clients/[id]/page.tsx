import { Suspense } from "react";
import { Spinner } from "@/components/ui/Feedback";
import { ClientDetail } from "@/features/clients/ClientDetail";

export default function ClientDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ClientDetail />
    </Suspense>
  );
}
