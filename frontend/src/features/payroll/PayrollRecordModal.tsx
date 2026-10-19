"use client";

import { CheckCircle2, Download, Pencil, Plus, RotateCcw, Trash2, Wallet } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { Alert, Spinner } from "@/components/ui/Feedback";
import { Input } from "@/components/ui/Form";
import { FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { StatusBadge } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api, approvalMessage, errorMessage, isApprovalRequested } from "@/lib/api";
import { useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import { humanize, monthLabel, paymentMethods, todayInput } from "@/lib/labels";
import { enumOptions } from "@/lib/options";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PayrollRecord } from "@/types/models";

type Panel = "view" | "edit" | "pay" | "adjust";

export function PayrollRecordModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { notify } = useToast();
  const record = useAsync(() => api.get<PayrollRecord & { monthInputs?: MonthInputs | null }>(`/payroll/${id}`), [id]);
  const [panel, setPanel] = useState<Panel>("view");
  const [confirm, setConfirm] = useState<"approve" | "reopen" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  const r = record.data;

  async function act(action: () => Promise<unknown>, message: string, close = false) {
    setBusy(true);
    try {
      await action();
      notify(message);
      setConfirm(null);
      onChanged();
      if (close) onClose();
      else record.reload();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  function done(message: string) {
    notify(message);
    setPanel("view");
    record.reload();
    onChanged();
  }

  return (
    <Modal open size="lg" title={r ? `${r.employee?.fullName} · ${monthLabel(r.periodYear, r.periodMonth)}` : "Payroll"} onClose={onClose}>
      {record.error && <Alert>{record.error}</Alert>}
      {!r ? (
        <Spinner />
      ) : panel === "edit" ? (
        <EditInputs record={r} onCancel={() => setPanel("view")} onSaved={() => done("Payroll recalculated")} />
      ) : panel === "pay" ? (
        <PayForm record={r} onCancel={() => setPanel("view")} onSaved={() => done("Marked as paid")} />
      ) : panel === "adjust" ? (
        <AdjustmentForm record={r} onCancel={() => setPanel("view")} onSaved={() => done("Adjustment recorded")} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            {r.approvedBy && <span className="text-xs text-muted">Approved by {r.approvedBy.name}</span>}
            {r.paidAt && (
              <span className="text-xs text-muted">
                Paid {formatDate(r.paidAt)} via {humanize(r.paymentMethod)}
                {r.paymentReference ? ` (${r.paymentReference})` : ""}
              </span>
            )}
            <a className="ml-auto" href={api.url(`/payroll/${r.id}/payslip`)} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                <Download className="size-4" /> Payslip PDF
              </Button>
            </a>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(["EARNING", "DEDUCTION"] as const).map((type) => (
              <div key={type} className="rounded-lg border border-line">
                <p className="border-b border-line px-3 py-2 text-xs font-semibold text-muted uppercase">{type === "EARNING" ? "Earnings" : "Deductions"}</p>
                <ul className="divide-y divide-line text-sm">
                  {(r.lines ?? [])
                    .filter((l) => l.type === type)
                    .map((l) => (
                      <li key={l.id} className="flex justify-between px-3 py-2">
                        <span>{l.label}</span>
                        <span className="tabular-nums">{formatCurrency(l.amount)}</span>
                      </li>
                    ))}
                  {(r.lines ?? []).filter((l) => l.type === type).length === 0 && <li className="px-3 py-2 text-muted">None</li>}
                </ul>
                <p className="flex justify-between border-t border-line px-3 py-2 text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(type === "EARNING" ? r.grossEarnings : r.totalDeductions)}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-page px-4 py-3">
            <span className="text-sm font-medium">Net pay</span>
            <span className="text-lg font-semibold tabular-nums">{formatCurrency(r.netPay)}</span>
          </div>

          {(r.adjustments?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Adjustments after payment</p>
              <DataTable
                rows={r.adjustments}
                columns={[
                  { header: "Date", cell: (a) => formatDate(a.paidAt ?? a.createdAt) },
                  { header: "Reason", cell: (a) => a.reason },
                  { header: "By", cell: (a) => a.createdBy?.name ?? "—" },
                  { header: "Amount", align: "right", cell: (a) => formatCurrency(a.amount) },
                ]}
              />
              <p className="mt-2 text-right text-xs text-muted">Total adjustments: {formatCurrency(r.adjustmentsTotal)}</p>
            </div>
          )}
          {r.notes && <p className="text-sm text-muted">Notes: {r.notes}</p>}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {r.status === "PENDING" && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setPanel("edit")}>
                  <Pencil className="size-4" /> Edit incentives / deductions
                </Button>
                <Button size="sm" onClick={() => setConfirm("approve")}>
                  <CheckCircle2 className="size-4" /> Approve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm("delete")}>
                  <Trash2 className="size-4" /> Delete
                </Button>
              </>
            )}
            {r.status === "APPROVED" && (
              <>
                <Button size="sm" onClick={() => setPanel("pay")}>
                  <Wallet className="size-4" /> Mark as paid
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirm("reopen")}>
                  <RotateCcw className="size-4" /> Back to pending
                </Button>
              </>
            )}
            {r.status === "PAID" && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setPanel("adjust")}>
                  <Plus className="size-4" /> Add adjustment
                </Button>
                <p className="self-center text-xs text-muted">Paid payroll is locked. Corrections are recorded as adjustments.</p>
              </>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm === "approve"}
        title="Approve payroll?"
        message="Approved payroll can be marked as paid. It can be moved back to pending until it is paid."
        confirmLabel="Approve"
        loading={busy}
        onConfirm={() => act(() => api.post(`/payroll/${id}/approve`), "Payroll approved")}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "reopen"}
        title="Move back to pending?"
        message="The record becomes editable again. This is recorded in the audit log."
        confirmLabel="Move to pending"
        loading={busy}
        onConfirm={() => act(() => api.post(`/payroll/${id}/reopen`), "Moved back to pending")}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete pending payroll?"
        message="Only pending records can be deleted."
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={() => act(() => api.delete(`/payroll/${id}`), "Payroll deleted", true)}
        onCancel={() => setConfirm(null)}
      />
    </Modal>
  );
}

interface MonthInputs {
  incentives?: string;
  additionalEarnings?: { label: string; amount: string }[];
  additionalDeductions?: { label: string; amount: string }[];
}

function LineEditor({ title, lines, onChange }: { title: string; lines: { label: string; amount: string }[]; onChange: (lines: { label: string; amount: string }[]) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {lines.map((line, index) => (
        <div key={index} className="flex gap-2">
          <Input value={line.label} placeholder="Label" aria-label={`${title} label`} onChange={(e) => onChange(lines.map((l, i) => (i === index ? { ...l, label: e.target.value } : l)))} />
          <Input
            value={line.amount}
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            aria-label={`${title} amount`}
            className="w-36"
            onChange={(e) => onChange(lines.map((l, i) => (i === index ? { ...l, amount: e.target.value } : l)))}
          />
          <button type="button" onClick={() => onChange(lines.filter((_, i) => i !== index))} className="rounded p-2 text-muted hover:text-danger" aria-label="Remove line">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...lines, { label: "", amount: "" }])}>
        <Plus className="size-4" /> Add line
      </Button>
    </div>
  );
}

function EditInputs({ record, onCancel, onSaved }: { record: PayrollRecord & { monthInputs?: MonthInputs | null }; onCancel: () => void; onSaved: () => void }) {
  const inputs = record.monthInputs ?? {};
  const form = useForm({ incentives: String(inputs.incentives ?? "0"), notes: record.notes ?? "" });
  const [earnings, setEarnings] = useState(inputs.additionalEarnings ?? []);
  const [deductions, setDeductions] = useState(inputs.additionalDeductions ?? []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() =>
      api.put(`/payroll/${record.id}`, {
        ...form.values,
        additionalEarnings: earnings.filter((l) => l.label || l.amount),
        additionalDeductions: deductions.filter((l) => l.label || l.amount),
      }),
    );
    if (saved) onSaved();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <p className="text-sm text-muted">Basic, allowances, fixed and statutory deductions come from the salary structure. Add this month&apos;s variable items below; the server recalculates net pay.</p>
      {form.formError && <Alert>{form.formError}</Alert>}
      <MoneyField form={form} name="incentives" label="Incentives" />
      <LineEditor title="Additional earnings" lines={earnings} onChange={setEarnings} />
      <LineEditor title="Additional deductions (e.g. loss of pay, advance recovery)" lines={deductions} onChange={setDeductions} />
      <TextAreaField form={form} name="notes" label="Notes" rows={2} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={form.submitting}>
          Recalculate &amp; save
        </Button>
      </div>
    </form>
  );
}

function PayForm({ record, onCancel, onSaved }: { record: PayrollRecord; onCancel: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const form = useForm({ paidAt: todayInput(), paymentMethod: "BANK_TRANSFER", paymentReference: "" });
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() => api.post(`/payroll/${record.id}/pay`, form.values));
    if (isApprovalRequested(saved)) {
      notify(`${approvalMessage(saved)}. The payroll stays unpaid until approved.`);
      onCancel();
    } else if (saved) onSaved();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-sm">
        Record payment of <strong>{formatCurrency(record.netPay)}</strong>. After this the record is locked.
      </p>
      {form.formError && <Alert>{form.formError}</Alert>}
      <FormGrid>
        <TextField form={form} name="paidAt" label="Payment date" type="date" required />
        <SelectField form={form} name="paymentMethod" label="Method" options={enumOptions(paymentMethods)} />
        <TextField form={form} name="paymentReference" label="Reference" />
      </FormGrid>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={form.submitting}>
          Mark as paid
        </Button>
      </div>
    </form>
  );
}

function AdjustmentForm({ record, onCancel, onSaved }: { record: PayrollRecord; onCancel: () => void; onSaved: () => void }) {
  const form = useForm({ amount: "", reason: "", paidAt: todayInput(), paymentMethod: "BANK_TRANSFER", paymentReference: "" });
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() => api.post(`/payroll/${record.id}/adjustments`, { ...form.values, paymentMethod: form.values.paymentMethod || null }));
    if (saved) onSaved();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Alert variant="info">The original paid record is not changed. Use a positive amount for additional pay or a negative amount for a recovery.</Alert>
      {form.formError && <Alert>{form.formError}</Alert>}
      <FormGrid>
        <TextField form={form} name="amount" label="Amount (+/−)" type="number" step="0.01" required />
        <TextField form={form} name="paidAt" label="Date" type="date" />
        <SelectField form={form} name="paymentMethod" label="Method" options={enumOptions(paymentMethods)} />
        <TextField form={form} name="paymentReference" label="Reference" />
      </FormGrid>
      <TextAreaField form={form} name="reason" label="Reason" required rows={2} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={form.submitting}>
          Record adjustment
        </Button>
      </div>
    </form>
  );
}
