"use client";

import { ImageUp, Trash2 } from "@/components/ui/icons";
import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert, Spinner } from "@/components/ui/Feedback";
import { CheckboxField, FormGrid, FormSection, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import type { CompanySettings, InvoiceTemplate } from "@/types/models";

const defaults = {
  legalName: "",
  tradingName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  email: "",
  phone: "",
  website: "",
  pan: "",
  isGstRegistered: false,
  gstin: "",
  taxLabel: "GST",
  defaultTaxRate: "0",
  splitTaxOnInvoice: false,
  otherTaxInfo: "",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankBranch: "",
  upiId: "",
  currency: "INR",
  invoicePrefix: "INV",
  invoiceNumberPadding: "4",
  invoiceUseFinancialYear: true,
  receiptPrefix: "RCPT",
  defaultPaymentTermsDays: "15",
  paymentTermsText: "",
  invoiceNotes: "",
  activeTemplateId: "",
};

export function CompanySettingsForm() {
  const settings = useAsync(() => api.get<CompanySettings>("/settings/company"), []);
  const templates = useAsync(() => api.get<InvoiceTemplate[]>("/settings/templates"), []);

  if (settings.error) return <Alert>{settings.error}</Alert>;
  if (!settings.data || !templates.data) return <Spinner />;
  return <CompanyForm initial={settings.data} templates={templates.data} onSaved={settings.reload} />;
}

function CompanyForm({ initial, templates, onSaved }: { initial: CompanySettings; templates: InvoiceTemplate[]; onSaved: () => void }) {
  const { notify } = useToast();
  const form = useForm(toFormValues(defaults, initial as unknown as Record<string, unknown>));
  const [logo, setLogo] = useState(initial.logo);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const v = form.values;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() =>
      api.put<CompanySettings>("/settings/company", {
        ...v,
        invoiceNumberPadding: Number(v.invoiceNumberPadding),
        defaultPaymentTermsDays: Number(v.defaultPaymentTermsDays),
        activeTemplateId: v.activeTemplateId || null,
      }),
    );
    if (saved) {
      notify("Company settings saved");
      onSaved();
    }
  }

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const updated = await api.post<CompanySettings>("/settings/company/logo", body);
      setLogo(updated.logo);
      notify("Logo updated");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLogoBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      await api.delete("/settings/company/logo");
      setLogo(null);
      notify("Logo removed");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLogoBusy(false);
    }
  }

  const previewNumber = `${v.invoicePrefix}-${v.invoiceUseFinancialYear ? "2026-27-" : ""}${"1".padStart(Number(v.invoiceNumberPadding) || 1, "0")}`;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Card className="space-y-6 p-5">
        {form.formError && <Alert>{form.formError}</Alert>}

        <FormSection title="Logo" description="PNG or JPEG, up to 5 MB. Shown on invoices, receipts and payslips.">
          <div className="flex items-center gap-4">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border border-line bg-page">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated API file, not a static asset
                <img src={api.fileUrl(logo.id)} alt="Company logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImageUp className="size-6 text-muted" />
              )}
            </div>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <Button variant="secondary" size="sm" loading={logoBusy} onClick={() => fileInput.current?.click()}>
              {logo ? "Replace logo" : "Upload logo"}
            </Button>
            {logo && (
              <Button variant="ghost" size="sm" onClick={removeLogo} disabled={logoBusy}>
                <Trash2 className="size-4" /> Remove
              </Button>
            )}
          </div>
        </FormSection>

        <FormSection title="Company">
          <FormGrid>
            <TextField form={form} name="legalName" label="Legal name" required />
            <TextField form={form} name="tradingName" label="Trading name" />
            <TextField form={form} name="addressLine1" label="Address line 1" />
            <TextField form={form} name="addressLine2" label="Address line 2" />
            <TextField form={form} name="city" label="City" />
            <TextField form={form} name="state" label="State" />
            <TextField form={form} name="postalCode" label="PIN / postal code" />
            <TextField form={form} name="country" label="Country" required />
            <TextField form={form} name="email" label="Email" type="email" />
            <TextField form={form} name="phone" label="Phone" />
            <TextField form={form} name="website" label="Website" />
          </FormGrid>
        </FormSection>

        <FormSection title="Tax" description="Tax registration is not assumed. Confirm applicable tax rules with your accountant.">
          <FormGrid>
            <TextField form={form} name="pan" label="PAN" />
            <TextField form={form} name="taxLabel" label="Tax label on invoices" hint='e.g. "GST"' required />
            <CheckboxField form={form} name="isGstRegistered" label="GST registered" hint="Shows GSTIN on invoices." />
            <TextField form={form} name="gstin" label="GSTIN" />
            <TextField form={form} name="defaultTaxRate" label="Default tax rate (%)" type="number" step="0.01" min="0" max="100" />
            <CheckboxField form={form} name="splitTaxOnInvoice" label="Show tax split into two halves" hint="e.g. CGST + SGST for intra-state supply." />
            <TextAreaField form={form} name="otherTaxInfo" label="Other tax information" className="sm:col-span-2" rows={2} />
          </FormGrid>
        </FormSection>

        <FormSection title="Bank details for invoices">
          <FormGrid>
            <TextField form={form} name="bankAccountName" label="Account name" />
            <TextField form={form} name="bankName" label="Bank name" />
            <TextField form={form} name="bankAccountNumber" label="Account number" />
            <TextField form={form} name="bankIfsc" label="IFSC" />
            <TextField form={form} name="bankBranch" label="Branch" />
            <TextField form={form} name="upiId" label="UPI ID" />
          </FormGrid>
        </FormSection>

        <FormSection title="Invoicing" description={`Next invoice numbers look like ${previewNumber}. Numbers are assigned when an invoice is issued.`}>
          <FormGrid>
            <TextField form={form} name="currency" label="Currency" required />
            <SelectField
              form={form}
              name="activeTemplateId"
              label="Invoice template"
              placeholder="None"
              options={templates.map((t) => ({ value: t.id, label: t.name }))}
            />
            <TextField form={form} name="invoicePrefix" label="Invoice prefix" required />
            <TextField form={form} name="invoiceNumberPadding" label="Number digits" type="number" min="1" max="8" />
            <CheckboxField form={form} name="invoiceUseFinancialYear" label="Include financial year" hint="Numbering restarts each April." />
            <TextField form={form} name="receiptPrefix" label="Receipt prefix" required />
            <TextField form={form} name="defaultPaymentTermsDays" label="Default payment terms (days)" type="number" min="0" max="365" />
            <div />
            <TextAreaField form={form} name="paymentTermsText" label="Payment terms text" className="sm:col-span-2" rows={2} />
            <TextAreaField form={form} name="invoiceNotes" label="Default invoice notes" className="sm:col-span-2" rows={2} />
          </FormGrid>
        </FormSection>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" loading={form.submitting}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
