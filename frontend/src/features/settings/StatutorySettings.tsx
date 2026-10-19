"use client";

import { Plus } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Alert, Badge } from "@/components/ui/Feedback";
import { CheckboxField, FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { formatCurrency } from "@/lib/utils";
import type { StatutoryDeduction } from "@/types/models";

const basisOptions = [
  { value: "PERCENT_OF_BASIC", label: "% of basic salary" },
  { value: "PERCENT_OF_GROSS", label: "% of gross earnings" },
  { value: "FIXED", label: "Fixed amount" },
];

export function StatutorySettings() {
  const rules = useAsync(() => api.get<StatutoryDeduction[]>("/payroll/statutory-deductions"), []);
  const [editing, setEditing] = useState<StatutoryDeduction | "new" | null>(null);

  return (
    <div className="space-y-4">
      <Alert variant="info">
        No statutory deductions are assumed. Add only rules that apply to your organisation (for example PF, ESI or professional tax) and verify rates and thresholds with a
        qualified professional. Rules apply only to employees whose salary structure has &quot;Apply statutory deductions&quot; enabled.
      </Alert>
      <Card>
        <CardHeader
          title="Payroll deduction rules"
          action={
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add rule
            </Button>
          }
        />
        <DataTable
          rows={rules.data}
          loading={rules.loading}
          error={rules.error}
          onRowClick={(row) => setEditing(row)}
          emptyTitle="No deduction rules"
          emptyDescription="Payroll will only include fixed deductions from each salary structure."
          columns={[
            { header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
            { header: "Basis", cell: (r) => humanize(r.basis) },
            { header: "Value", cell: (r) => (r.basis === "FIXED" ? formatCurrency(r.value) : `${r.value}%`), align: "right" },
            { header: "Cap", cell: (r) => (r.maxAmount ? formatCurrency(r.maxAmount) : "—"), align: "right" },
            { header: "Status", cell: (r) => (r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
          ]}
        />
      </Card>
      {editing && (
        <RuleModal
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            rules.reload();
          }}
        />
      )}
    </div>
  );
}

function RuleModal({ rule, onClose, onSaved }: { rule: StatutoryDeduction | null; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const form = useForm(toFormValues({ name: "", basis: "PERCENT_OF_BASIC", value: "", maxAmount: "", isActive: true, notes: "" }, rule as unknown as Record<string, unknown>));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = { ...form.values, maxAmount: form.values.maxAmount || null };
    const saved = await form.submit(() => (rule ? api.put(`/payroll/statutory-deductions/${rule.id}`, body) : api.post("/payroll/statutory-deductions", body)));
    if (saved) {
      notify("Rule saved");
      onSaved();
    }
  }

  return (
    <Modal
      open
      title={rule ? "Edit deduction rule" : "Add deduction rule"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rule-form" loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="rule-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormGrid>
          <TextField form={form} name="name" label="Name" required />
          <SelectField form={form} name="basis" label="Basis" options={basisOptions} />
          <MoneyField form={form} name="value" label={form.values.basis === "FIXED" ? "Amount" : "Percentage"} required />
          <MoneyField form={form} name="maxAmount" label="Maximum amount (optional)" />
          <CheckboxField form={form} name="isActive" label="Active" />
        </FormGrid>
        <TextAreaField form={form} name="notes" label="Notes" rows={2} />
      </form>
    </Modal>
  );
}
