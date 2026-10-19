"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { DataTable, Pagination } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Misc";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { monthLabel } from "@/lib/labels";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PayrollRecord } from "@/types/models";
import { PayrollRecordModal } from "./PayrollRecordModal";

/** Payroll records for admins, filterable by period, status, employee or search. */
export function PayrollTable({ employeeId, period, status, search, reloadKey = 0 }: { employeeId?: string; period?: string; status?: string; search?: string; reloadKey?: number }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const records = useAsync(() => api.list<PayrollRecord>("/payroll", { employeeId, period, status, search, page }), [employeeId, period, status, search, page, reloadKey]);

  return (
    <Card>
      <DataTable
        rows={records.data?.items}
        loading={records.loading}
        error={records.error}
        onRowClick={(r) => setSelected(r.id)}
        emptyTitle="No payroll records"
        emptyDescription={period ? "Use Generate payroll to create records for all active employees." : undefined}
        columns={[
          { header: "Period", cell: (r) => monthLabel(r.periodYear, r.periodMonth) },
          ...(employeeId
            ? []
            : [
                {
                  header: "Employee",
                  cell: (r: PayrollRecord) => (
                    <div>
                      <p className="font-medium">{r.employee?.fullName}</p>
                      <p className="text-xs text-muted">{r.employee?.employeeCode}</p>
                    </div>
                  ),
                },
              ]),
          { header: "Gross", align: "right", cell: (r) => formatCurrency(r.grossEarnings) },
          { header: "Deductions", align: "right", cell: (r) => formatCurrency(r.totalDeductions) },
          { header: "Net pay", align: "right", cell: (r) => <span className="font-medium">{formatCurrency(r.netPay)}</span> },
          { header: "Adjustments", align: "right", cell: (r) => (Number(r.adjustmentsTotal) ? formatCurrency(r.adjustmentsTotal) : "—") },
          { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          { header: "Paid on", cell: (r) => formatDate(r.paidAt) },
        ]}
      />
      <Pagination meta={records.data?.meta} onPage={setPage} />
      {selected && <PayrollRecordModal id={selected} onClose={() => setSelected(null)} onChanged={records.reload} />}
    </Card>
  );
}
