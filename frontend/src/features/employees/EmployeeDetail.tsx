"use client";

import { ArrowLeft, Pencil, Plus, Trash2 } from "@/components/ui/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Alert, Badge, Spinner } from "@/components/ui/Feedback";
import { CheckboxField, FormGrid, MoneyField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { DetailList, StatusBadge } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PayrollTable } from "@/features/payroll/PayrollTable";
import { api, errorMessage } from "@/lib/api";
import { useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import { todayInput } from "@/lib/labels";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Employee, SalaryStructure } from "@/types/models";
import { EmployeeFormModal } from "./EmployeeForm";

export function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const { notify } = useToast();
  const employee = useAsync(() => api.get<Employee>(`/employees/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [addingSalary, setAddingSalary] = useState(false);

  if (employee.error) return <Alert>{employee.error}</Alert>;
  if (!employee.data) return <Spinner />;
  const e = employee.data;

  async function removeStructure(structure: SalaryStructure) {
    try {
      await api.delete(`/employees/${e.id}/salary-structures/${structure.id}`);
      notify("Salary revision removed");
      employee.reload();
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }

  return (
    <>
      <Link href="/employees" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Employees
      </Link>
      <PageHeader
        title={e.fullName}
        description={`${e.employeeCode}${e.designation ? ` · ${e.designation}` : ""}`}
        actions={
          <>
            <StatusBadge status={e.status} />
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Details" />
          <div className="p-5">
            <DetailList
              items={[
                { label: "Email", value: e.email },
                { label: "Phone", value: e.phone },
                { label: "Department", value: e.department },
                { label: "Joining date", value: formatDate(e.joiningDate) },
                { label: "Exit date", value: e.exitDate ? formatDate(e.exitDate) : null },
                { label: "PAN", value: e.pan },
                { label: "Bank", value: [e.bankAccountName, e.bankName].filter(Boolean).join(" · ") },
                { label: "Account no. / IFSC", value: [e.bankAccountNumber, e.bankIfsc].filter(Boolean).join(" / ") },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Salary history"
            description="Each revision applies from its effective date. Revisions used in payroll cannot be deleted."
            action={
              <Button size="sm" variant="secondary" onClick={() => setAddingSalary(true)}>
                <Plus className="size-4" /> New revision
              </Button>
            }
          />
          <DataTable
            rows={e.salaryStructures}
            emptyTitle="No salary structure"
            emptyDescription="Add a salary structure before running payroll."
            columns={[
              {
                header: "Effective",
                cell: (s) => (
                  <span className="flex items-center gap-2">
                    {formatDate(s.effectiveFrom)}
                    {e.currentSalary?.id === s.id && <Badge tone="success">Current</Badge>}
                  </span>
                ),
              },
              { header: "Basic", align: "right", cell: (s) => formatCurrency(s.basic) },
              { header: "Allowances", align: "right", cell: (s) => formatCurrency(s.allowances) },
              { header: "Other", align: "right", cell: (s) => formatCurrency(s.otherEarnings) },
              { header: "Fixed ded.", align: "right", cell: (s) => formatCurrency(s.fixedDeductions) },
              { header: "Statutory", cell: (s) => (s.applyStatutory ? <Badge tone="info">Applies</Badge> : "—") },
              {
                header: "",
                align: "right",
                cell: (s) => (
                  <button onClick={() => removeStructure(s)} className="rounded p-1.5 text-muted hover:bg-page hover:text-danger" aria-label="Remove revision">
                    <Trash2 className="size-4" />
                  </button>
                ),
              },
            ]}
          />
        </Card>
      </div>
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">Payroll history</h2>
        <PayrollTable employeeId={e.id} />
      </div>
      {editing && (
        <EmployeeFormModal
          employee={e}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            employee.reload();
          }}
        />
      )}
      {addingSalary && (
        <SalaryModal
          employeeId={e.id}
          onClose={() => setAddingSalary(false)}
          onSaved={() => {
            setAddingSalary(false);
            employee.reload();
          }}
        />
      )}
    </>
  );
}

function SalaryModal({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const form = useForm({ effectiveFrom: todayInput(), basic: "", allowances: "0", otherEarnings: "0", fixedDeductions: "0", applyStatutory: false, notes: "" });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() => api.post(`/employees/${employeeId}/salary-structures`, form.values));
    if (saved) {
      notify("Salary revision added");
      onSaved();
    }
  }

  return (
    <Modal
      open
      title="New salary revision"
      description="Payroll for a month uses the latest revision effective on or before the month's last day."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="salary-form" loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="salary-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormGrid>
          <TextField form={form} name="effectiveFrom" label="Effective from" type="date" required />
          <MoneyField form={form} name="basic" label="Basic salary (monthly)" required />
          <MoneyField form={form} name="allowances" label="Allowances (monthly)" />
          <MoneyField form={form} name="otherEarnings" label="Other earnings (monthly)" />
          <MoneyField form={form} name="fixedDeductions" label="Fixed deductions (monthly)" />
        </FormGrid>
        <CheckboxField form={form} name="applyStatutory" label="Apply statutory deductions" hint="Uses the rules configured in Settings › Payroll deductions." />
        <TextAreaField form={form} name="notes" label="Notes" rows={2} />
      </form>
    </Modal>
  );
}
