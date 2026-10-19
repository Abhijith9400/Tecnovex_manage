"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { FormGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { enumOptions, useClientOptions } from "@/lib/options";
import type { Agreement } from "@/types/models";

export const AGREEMENT_STATUSES = ["DRAFT", "SENT", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED"] as const;

const defaults = {
  clientId: "",
  title: "",
  reference: "",
  effectiveDate: "",
  expiryDate: "",
  contractValue: "",
  status: "DRAFT",
  scopeOfWork: "",
  monthlyDeliverables: "",
  postsPerMonth: "",
  carouselsPerMonth: "",
  reelsPerMonth: "",
  revisionLimit: "",
  exclusions: "",
  paymentTerms: "",
  renewalReminderDays: "30",
  notes: "",
};

export function AgreementFormModal({
  agreement,
  clientId,
  onClose,
  onSaved,
}: {
  agreement: Agreement | null;
  clientId?: string;
  onClose: () => void;
  onSaved: (agreement: Agreement) => void;
}) {
  const { notify } = useToast();
  const clients = useClientOptions();
  const form = useForm(toFormValues({ ...defaults, clientId: clientId ?? "" }, agreement as unknown as Record<string, unknown>));
  const [files, setFiles] = useState<FileList | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(async () => {
      const result = agreement ? await api.put<Agreement>(`/agreements/${agreement.id}`, form.values) : await api.post<Agreement>("/agreements", form.values);
      if (files?.length) {
        const body = new FormData();
        for (const file of Array.from(files)) body.append("files", file);
        body.append("label", "Agreement");
        return api.post<Agreement>(`/agreements/${result.id}/documents`, body);
      }
      return result;
    });
    if (saved) {
      notify(agreement ? "Agreement updated" : "Agreement created");
      onSaved(saved);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={agreement ? "Edit agreement" : "New agreement"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="agreement-form" loading={form.submitting}>
            Save agreement
          </Button>
        </>
      }
    >
      <form id="agreement-form" onSubmit={onSubmit} className="space-y-6" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormSection title="Agreement">
          <FormGrid>
            {!clientId && !agreement && (
              <SelectField form={form} name="clientId" label="Client" required placeholder="Choose a client" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            )}
            <TextField form={form} name="title" label="Title" required />
            <TextField form={form} name="reference" label="Reference" />
            <SelectField form={form} name="status" label="Status" options={enumOptions(AGREEMENT_STATUSES)} />
            <TextField form={form} name="effectiveDate" label="Effective date" type="date" required />
            <TextField form={form} name="expiryDate" label="Expiry date" type="date" />
            <MoneyField form={form} name="contractValue" label="Contract value" />
            <TextField form={form} name="renewalReminderDays" label="Renewal reminder (days before expiry)" type="number" min="0" max="365" />
          </FormGrid>
        </FormSection>
        <FormSection title="Scope of work">
          <div className="space-y-4">
            <TextAreaField form={form} name="scopeOfWork" label="Scope of work" rows={4} />
            <TextAreaField form={form} name="monthlyDeliverables" label="Monthly deliverables" rows={2} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <TextField form={form} name="postsPerMonth" label="Posts / month" type="number" min="0" />
              <TextField form={form} name="carouselsPerMonth" label="Carousels / month" type="number" min="0" />
              <TextField form={form} name="reelsPerMonth" label="Reels / month" type="number" min="0" />
              <TextField form={form} name="revisionLimit" label="Revision limit" type="number" min="0" />
            </div>
            <TextAreaField form={form} name="exclusions" label="Exclusions" rows={2} />
            <TextAreaField form={form} name="paymentTerms" label="Payment terms" rows={2} />
            <TextAreaField form={form} name="notes" label="Internal notes" rows={2} />
          </div>
        </FormSection>
        {!agreement && (
          <Field label="Signed agreement / supporting documents" hint="PDF, DOCX, JPG or PNG, up to 25 MB each. You can add more later.">
            {(props) => (
              <input
                {...props}
                type="file"
                multiple
                accept="application/pdf,.docx,image/jpeg,image/png"
                onChange={(e) => setFiles(e.target.files)}
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-page file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
              />
            )}
          </Field>
        )}
      </form>
    </Modal>
  );
}
