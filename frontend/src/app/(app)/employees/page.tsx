"use client";

import { Plus } from "@/components/ui/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Misc";
import { RequireRole } from "@/features/auth/RequireRole";
import { roleGroups } from "@/lib/navigation";
import { EMPLOYMENT_STATUSES, EmployeeFormModal } from "@/features/employees/EmployeeForm";
import { api } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { enumOptions } from "@/lib/options";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Employee } from "@/types/models";

export default function EmployeesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(search);
  const employees = useAsync(() => api.list<Employee>("/employees", { search: debounced, status, page }), [debounced, status, page]);

  return (
    <RequireRole roles={roleGroups.MANAGEMENT}>
      <PageHeader
        title="Employees"
        description="Team records and salary structures. Restricted to administrators."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add employee
          </Button>
        }
      />
      <Card>
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Name, ID, designation…"
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={enumOptions(EMPLOYMENT_STATUSES)}
          />
        </Toolbar>
        <DataTable
          rows={employees.data?.items}
          loading={employees.loading}
          error={employees.error}
          onRowClick={(e) => router.push(`/employees/${e.id}`)}
          emptyTitle="No employees"
          columns={[
            { header: "ID", cell: (e) => <span className="font-mono text-xs">{e.employeeCode}</span> },
            {
              header: "Name",
              cell: (e) => (
                <div>
                  <p className="font-medium">{e.fullName}</p>
                  <p className="text-xs text-muted">{[e.designation, e.department].filter(Boolean).join(" · ")}</p>
                </div>
              ),
            },
            { header: "Joined", cell: (e) => formatDate(e.joiningDate) },
            { header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
            { header: "Bank a/c", cell: (e) => <span className="font-mono text-xs">{e.bankAccountNumber ?? "—"}</span> },
            {
              header: "Current basic",
              align: "right",
              cell: (e) => (e.currentSalary ? formatCurrency(e.currentSalary.basic) : <span className="text-muted">No structure</span>),
            },
          ]}
        />
        <Pagination meta={employees.data?.meta} onPage={setPage} />
      </Card>
      {creating && <EmployeeFormModal employee={null} onClose={() => setCreating(false)} onSaved={(e) => router.push(`/employees/${e.id}`)} />}
    </RequireRole>
  );
}
