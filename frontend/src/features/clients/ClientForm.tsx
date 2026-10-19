"use client";

import { type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { FormGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { api } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { enumOptions } from "@/lib/options";
import type { Client } from "@/types/models";

const defaults = {
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  pan: "",
  gstin: "",
  billingType: "RETAINER",
  monthlyRetainer: "",
  projectPrice: "",
  billingCycle: "MONTHLY",
  paymentTermsDays: "15",
  status: "ACTIVE",
  notes: "",
};

export function ClientFormModal({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: (client: Client) => void }) {
  const { notify } = useToast();
  const form = useForm(toFormValues(defaults, client as unknown as Record<string, unknown>));

  // Employees don't see or change what a client pays.
  const showPricing = useAuth().user.role !== "EMPLOYEE";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = { ...form.values, paymentTermsDays: Number(form.values.paymentTermsDays || 0) };
    const saved = await form.submit(() => (client ? api.put<Client>(`/clients/${client.id}`, body) : api.post<Client>("/clients", body)));
    if (saved) {
      notify(client ? "Client updated" : "Client created");
      onSaved(saved);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={client ? `Edit ${client.name}` : "New client"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="client-form" loading={form.submitting}>
            Save client
          </Button>
        </>
      }
    >
      <form id="client-form" onSubmit={onSubmit} className="space-y-6" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormSection title="Client">
          <FormGrid>
            <TextField form={form} name="name" label="Client / company name" required />
            <SelectField form={form} name="status" label="Status" options={enumOptions(["LEAD", "ACTIVE", "ON_HOLD", "INACTIVE"])} />
            <TextField form={form} name="contactPerson" label="Contact person" />
            <TextField form={form} name="email" label="Email" type="email" />
            <TextField form={form} name="phone" label="Phone" />
          </FormGrid>
        </FormSection>
        <FormSection title="Address & tax">
          <FormGrid>
            <TextField form={form} name="addressLine1" label="Address line 1" />
            <TextField form={form} name="addressLine2" label="Address line 2" />
            <TextField form={form} name="city" label="City" />
            <TextField form={form} name="state" label="State" />
            <TextField form={form} name="postalCode" label="PIN / postal code" />
            <TextField form={form} name="country" label="Country" required />
            <TextField form={form} name="pan" label="PAN" hint="If applicable" />
            <TextField form={form} name="gstin" label="GSTIN" hint="If applicable" />
          </FormGrid>
        </FormSection>
        <FormSection title="Billing" description="Recurring services and their prices are managed on the client's Overview tab.">
          <FormGrid>
            <SelectField form={form} name="billingType" label="Billing type" options={enumOptions(["RETAINER", "PROJECT"])} />
            <SelectField form={form} name="billingCycle" label="Billing cycle" options={enumOptions(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "ONE_TIME"])} />
            {showPricing && (
              <>
                <MoneyField form={form} name="monthlyRetainer" label="Monthly retainer" />
                <MoneyField form={form} name="projectPrice" label="Project price" />
              </>
            )}
            <TextField form={form} name="paymentTermsDays" label="Payment terms (days)" type="number" min="0" max="365" />
          </FormGrid>
        </FormSection>
        <TextAreaField form={form} name="notes" label="Notes" rows={3} />
      </form>
    </Modal>
  );
}
