"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { RequireRole } from "@/features/auth/RequireRole";
import { CashEntries } from "@/features/expenses/CashEntries";
import { roleGroups } from "@/lib/navigation";

export default function ExpensesPage() {
  return (
    <RequireRole roles={roleGroups.FINANCE}>
      <PageHeader title="Expenses" description="Business expenses with receipts. Payroll is tracked separately under Payroll." />
      <CashEntries kind="expense" />
    </RequireRole>
  );
}
