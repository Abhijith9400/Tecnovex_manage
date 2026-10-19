"use client";

import { type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { FormGrid, FormSection, SelectField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { enumOptions } from "@/lib/options";
import type { Employee } from "@/types/models";

export const EMPLOYMENT_STATUSES = ["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"] as const;

const defaults = {
  employeeCode: "",
  fullName: "",
  email: "",
  phone: "",
  designation: "",
  department: "",
  joiningDate: "",
  exitDate: "",
  status: "ACTIVE",
  pan: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankName: "",
};

export function EmployeeFormModal({ employee, onClose, onSaved }: { employee: Employee | null; onClose: () => void; onSaved: (e: Employee) => void }) {
  const { notify } = useToast();
  const form = useForm(toFormValues(defaults, employee as unknown as Record<string, unknown>));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() => (employee ? api.put<Employee>(`/employees/${employee.id}`, form.values) : api.post<Employee>("/employees", form.values)));
    if (saved) {
      notify(employee ? "Employee updated" : "Employee added");
      onSaved(saved);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={employee ? `Edit ${employee.fullName}` : "Add employee"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={onSubmit} className="space-y-6" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormSection title="Employee">
          <FormGrid>
            <TextField form={form} name="employeeCode" label="Employee ID" hint={employee ? undefined : "Leave blank to auto-generate (EMP-0001…)."} />
            <TextField form={form} name="fullName" label="Full name" required />
            <TextField form={form} name="email" label="Email" type="email" />
            <TextField form={form} name="phone" label="Phone" />
            <TextField form={form} name="designation" label="Designation" />
            <TextField form={form} name="department" label="Department" />
            <TextField form={form} name="joiningDate" label="Joining date" type="date" required />
            <TextField form={form} name="exitDate" label="Exit date" type="date" />
            <SelectField form={form} name="status" label="Employment status" options={enumOptions(EMPLOYMENT_STATUSES)} />
          </FormGrid>
        </FormSection>
        <FormSection title="Payment details (restricted)" description="Visible to administrators only. Only the last 4 digits appear in lists and on payslips.">
          <FormGrid>
            <TextField form={form} name="pan" label="PAN" />
            <TextField form={form} name="bankAccountName" label="Account holder name" />
            <TextField form={form} name="bankName" label="Bank name" />
            <TextField form={form} name="bankAccountNumber" label="Account number" autoComplete="off" />
            <TextField form={form} name="bankIfsc" label="IFSC" />
          </FormGrid>
        </FormSection>
      </form>
    </Modal>
  );
}
