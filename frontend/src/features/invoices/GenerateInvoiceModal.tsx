"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Alert } from "@/components/ui/Feedback";
import { FormGrid, SelectField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/api";
import { useForm } from "@/lib/form";
import { currentPeriod, periodLabel, todayInput } from "@/lib/labels";
import { useClientOptions } from "@/lib/options";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/types/models";

interface MonthlyResult {
  created: { clientName: string; invoiceId: string; total: string }[];
  skipped: { clientName: string; reason: string }[];
}

/** Creates draft invoices from clients' recurring services, for one client or all active clients. */
export function GenerateInvoiceModal({ clientId, onClose, onDone }: { clientId?: string; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const { notify } = useToast();
  const clients = useClientOptions();
  const [mode, setMode] = useState<"single" | "all">("single");
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [result, setResult] = useState<MonthlyResult | null>(null);
  const form = useForm({ clientId: clientId ?? "", billingPeriod: currentPeriod(), issueDate: todayInput() });

  async function generateSingle(allowDuplicate = false) {
    setDuplicate(null);
    const created = await form.submit(async () => {
      try {
        return await api.post<Invoice>("/invoices/generate", { ...form.values, allowDuplicate });
      } catch (error) {
        if (error instanceof ApiError && error.code === "DUPLICATE_PERIOD") {
          setDuplicate(error.message);
          return undefined;
        }
        throw error;
      }
    });
    if (created) {
      notify("Draft invoice generated");
      router.push(`/invoices/${created.id}`);
    }
  }

  async function generateAll() {
    const res = await form.submit(() => api.post<MonthlyResult>("/invoices/generate-monthly", { billingPeriod: form.values.billingPeriod, issueDate: form.values.issueDate }));
    if (res) {
      setResult(res);
      onDone();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "single") void generateSingle();
    else void generateAll();
  }

  return (
    <Modal
      open
      title="Generate invoices from recurring services"
      description="Drafts are created from each client's active recurring services (or monthly retainer). Review them, then issue."
      onClose={onClose}
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="generate-form" loading={form.submitting}>
              Generate draft{mode === "all" ? "s" : ""}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4 text-sm">
          <Alert variant="success">
            {result.created.length} draft invoice(s) created for {periodLabel(form.values.billingPeriod)}.
          </Alert>
          {result.created.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {result.created.map((c) => (
                <li key={c.invoiceId} className="flex justify-between px-3 py-2">
                  <span>{c.clientName}</span>
                  <span className="tabular-nums">{formatCurrency(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
          {result.skipped.length > 0 && (
            <div>
              <p className="mb-1 font-medium">Skipped</p>
              <ul className="space-y-1 text-muted">
                {result.skipped.map((s) => (
                  <li key={s.clientName}>
                    {s.clientName}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <form id="generate-form" onSubmit={onSubmit} className="space-y-4" noValidate>
          {!clientId && (
            <Tabs
              tabs={[
                { value: "single", label: "One client" },
                { value: "all", label: "All active clients" },
              ]}
              active={mode}
              onChange={setMode}
            />
          )}
          {form.formError && <Alert>{form.formError}</Alert>}
          <FormGrid>
            {mode === "single" && !clientId && (
              <SelectField form={form} name="clientId" label="Client" required placeholder="Choose a client" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            )}
            <TextField form={form} name="billingPeriod" label="Billing month" type="month" required />
            <TextField form={form} name="issueDate" label="Invoice date" type="date" required />
          </FormGrid>
          {mode === "all" && <p className="text-xs text-muted">Clients that already have an invoice for this month are skipped automatically.</p>}
        </form>
      )}
      <ConfirmDialog
        open={Boolean(duplicate)}
        title="Invoice already exists for this month"
        message={`${duplicate ?? ""} Creating another may bill the client twice.`}
        confirmLabel="Create anyway"
        onConfirm={() => generateSingle(true)}
        onCancel={() => setDuplicate(null)}
      />
    </Modal>
  );
}
