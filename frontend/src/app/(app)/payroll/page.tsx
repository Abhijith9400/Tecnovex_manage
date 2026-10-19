"use client";

import { Download, Plus, Repeat } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { Alert } from "@/components/ui/Feedback";
import { MonthPicker } from "@/components/ui/Filters";
import { FormGrid, MoneyField, SelectField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { RequireRole } from "@/features/auth/RequireRole";
import { PayrollTable } from "@/features/payroll/PayrollTable";
import { api } from "@/lib/api";
import { useForm } from "@/lib/form";
import { useAsync, useDebounced } from "@/lib/hooks";
import { currentPeriod, monthLabel, periodLabel } from "@/lib/labels";
import { enumOptions } from "@/lib/options";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Employee, PayrollRecord } from "@/types/models";

export default function PayrollPage() {
  const { user } = useAuth();
  return (
    <RequireRole roles={["ADMIN", "MANAGER", "EMPLOYEE"]}>
      {user.role === "EMPLOYEE" ? <MyPayslips /> : <AdminPayroll />}
    </RequireRole>
  );
}

function AdminPayroll() {
  const { notify } = useToast();
  const [period, setPeriod] = useState(currentPeriod());
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const debounced = useDebounced(search);

  async function generate() {
    setGenerating(true);
    try {
      const result = await api.post<{ created: string[]; skipped: { employee: string; reason: string }[] }>("/payroll/generate", { period });
      notify(`${result.created.length} payroll record(s) created${result.skipped.length ? `, ${result.skipped.length} skipped` : ""}`);
      for (const s of result.skipped.filter((x) => !x.reason.includes("already exists"))) notify(`${s.employee}: ${s.reason}`, "error");
      setReloadKey((k) => k + 1);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed", "error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Payroll & Payslips"
        description="Monthly payroll: calculate, review, approve, pay, then download payslips."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Single employee
            </Button>
            <Button onClick={generate} loading={generating} disabled={!period}>
              <Repeat className="size-4" /> Generate for {period ? periodLabel(period) : "month"}
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <Alert variant="info">Statutory deductions are applied only as configured in Settings › Payroll deductions. Verify applicable compliance requirements independently.</Alert>
      </div>
      <Card className="mb-4">
        <Toolbar>
          <MonthPicker value={period} onChange={setPeriod} label="Payroll month" />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={enumOptions(["PENDING", "APPROVED", "PAID"])} />
          <SearchInput value={search} onChange={setSearch} placeholder="Employee name or ID…" />
        </Toolbar>
      </Card>
      <PayrollTable period={period || undefined} status={status || undefined} search={debounced || undefined} reloadKey={reloadKey} />
      {creating && (
        <CreatePayrollModal
          period={period}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

function CreatePayrollModal({ period, onClose, onCreated }: { period: string; onClose: () => void; onCreated: () => void }) {
  const { notify } = useToast();
  const employees = useAsync(() => api.list<Employee>("/employees", { status: "ACTIVE", pageSize: 100 }), []);
  const form = useForm({ employeeId: "", period: period || currentPeriod(), incentives: "0" });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const created = await form.submit(() => api.post("/payroll", form.values));
    if (created) {
      notify("Payroll record created");
      onCreated();
    }
  }

  return (
    <Modal
      open
      title="Create payroll record"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-payroll" loading={form.submitting}>
            Calculate
          </Button>
        </>
      }
    >
      <form id="create-payroll" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormGrid>
          <SelectField
            form={form}
            name="employeeId"
            label="Employee"
            required
            placeholder="Choose an employee"
            options={(employees.data?.items ?? []).map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))}
          />
          <TextField form={form} name="period" label="Payroll month" type="month" required />
          <MoneyField form={form} name="incentives" label="Incentives" />
        </FormGrid>
        <p className="text-xs text-muted">Additional earnings and deductions can be added after creation while the record is pending.</p>
      </form>
    </Modal>
  );
}

/** Employee self-service: own paid payslips only (enforced by the API). */
function MyPayslips() {
  const [page, setPage] = useState(1);
  const records = useAsync(() => api.list<PayrollRecord>("/payroll/my", { page }), [page]);
  return (
    <>
      <PageHeader title="My payslips" description="Payslips for months that have been paid." />
      <Card>
        <DataTable
          rows={records.data?.items}
          loading={records.loading}
          error={records.error}
          emptyTitle="No payslips yet"
          columns={[
            { header: "Period", cell: (r) => monthLabel(r.periodYear, r.periodMonth) },
            { header: "Net pay", align: "right", cell: (r) => formatCurrency(r.netPay) },
            { header: "Paid on", cell: (r) => formatDate(r.paidAt) },
            {
              header: "",
              align: "right",
              cell: (r) => (
                <a href={api.url(`/payroll/${r.id}/payslip`, { download: 1 })}>
                  <Button size="sm" variant="secondary">
                    <Download className="size-4" /> Payslip
                  </Button>
                </a>
              ),
            },
          ]}
        />
        <Pagination meta={records.data?.meta} onPage={setPage} />
      </Card>
    </>
  );
}
