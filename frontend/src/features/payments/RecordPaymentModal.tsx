"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api, approvalMessage, type ApprovalRequested, isApprovalRequested } from "@/lib/api";
import { useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import { paymentMethods, todayInput } from "@/lib/labels";
import { enumOptions, newIdempotencyKey, useClientOptions } from "@/lib/options";
import { formatCurrency } from "@/lib/utils";
import type { Invoice, Payment } from "@/types/models";

/**
 * Records a payment against an invoice (or on account for a client). The idempotency key is created once
 * per opened form, so double-clicks and network retries cannot record the payment twice.
 */
export function RecordPaymentModal({ invoice, onClose, onRecorded }: { invoice?: Invoice; onClose: () => void; onRecorded: (payment: Payment) => void }) {
  const { notify } = useToast();
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [proof, setProof] = useState<File | null>(null);
  const clients = useClientOptions();
  const form = useForm({
    clientId: invoice?.clientId ?? "",
    invoiceId: invoice?.id ?? "",
    paymentDate: todayInput(),
    amount: invoice?.balanceDue ?? "",
    method: "BANK_TRANSFER",
    reference: "",
    notes: "",
  });
  const openInvoices = useAsync(
    () =>
      !invoice && form.values.clientId
        ? Promise.all(["ISSUED", "PARTIALLY_PAID", "OVERDUE"].map((status) => api.list<Invoice>("/invoices", { clientId: form.values.clientId, status, pageSize: 100 }))).then((r) =>
            r.flatMap((x) => x.items),
          )
        : Promise.resolve([] as Invoice[]),
    [invoice?.id, form.values.clientId],
  );
  const selectedInvoice = invoice ?? openInvoices.data?.find((i) => i.id === form.values.invoiceId);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = new FormData();
    for (const [key, value] of Object.entries(form.values)) if (value !== "") body.append(key, String(value));
    body.append("idempotencyKey", idempotencyKey);
    if (proof) body.append("proof", proof);
    const result = await form.submit(() =>
      api.post<{ payment: Payment; duplicateSubmission: boolean } | ApprovalRequested>(invoice ? `/invoices/${invoice.id}/payments` : "/payments", body),
    );
    if (result && isApprovalRequested(result)) {
      notify(`${approvalMessage(result)}. It will count once approved.`);
      onClose();
    } else if (result) {
      notify(result.duplicateSubmission ? `Already recorded as ${result.payment.receiptNumber}` : `Payment recorded · receipt ${result.payment.receiptNumber}`);
      onRecorded(result.payment);
    }
  }

  return (
    <Modal
      open
      title="Record payment"
      description={invoice ? `${invoice.invoiceNumber} · balance ${formatCurrency(invoice.balanceDue)}` : "Link the payment to an open invoice, or record it on account."}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={form.submitting}>
            Record payment
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormGrid>
          {!invoice && (
            <>
              <SelectField form={form} name="clientId" label="Client" required placeholder="Choose a client" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
              <SelectField
                form={form}
                name="invoiceId"
                label="Invoice"
                placeholder="On account (no invoice)"
                options={(openInvoices.data ?? []).map((i) => ({ value: i.id, label: `${i.invoiceNumber} · due ${formatCurrency(i.balanceDue)}` }))}
              />
            </>
          )}
          <TextField form={form} name="paymentDate" label="Payment date" type="date" required />
          <MoneyField form={form} name="amount" label="Amount" required />
          <SelectField form={form} name="method" label="Method" options={enumOptions(paymentMethods)} />
          <TextField form={form} name="reference" label="Transaction / reference no." hint="UTR, UPI ref, cheque no. Duplicates are blocked." />
        </FormGrid>
        {selectedInvoice && Number(form.values.amount) > Number(selectedInvoice.balanceDue) && (
          <Alert>Amount exceeds the outstanding balance of {formatCurrency(selectedInvoice.balanceDue)}.</Alert>
        )}
        <TextAreaField form={form} name="notes" label="Notes" rows={2} />
        <Field label="Proof of payment" hint="Optional. PDF, JPG, PNG or WEBP up to 10 MB.">
          {(props) => (
            <input
              {...props}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setProof(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-page file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
