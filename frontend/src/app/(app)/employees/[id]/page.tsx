"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/Feedback";
import { RequireRole } from "@/features/auth/RequireRole";
import { roleGroups } from "@/lib/navigation";
import { EmployeeDetail } from "@/features/employees/EmployeeDetail";

export default function EmployeeDetailPage() {
  return (
    <RequireRole roles={roleGroups.MANAGEMENT}>
      <Suspense fallback={<Spinner />}>
        <EmployeeDetail />
      </Suspense>
    </RequireRole>
  );
}
