"use client";

import { Eye, Plus, Trash2, Upload } from "@/components/ui/icons";
import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Alert, Badge, EmptyState, Spinner } from "@/components/ui/Feedback";
import { CheckboxField, FormGrid, FormSection, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { FileLink } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import type { CompanySettings, InvoiceTemplate } from "@/types/models";

const defaults = {
  name: "",
  layout: "CLASSIC",
  primaryColor: "#C2410C",
  accentColor: "#F97316",
  headerText: "",
  footerText: "",
  termsText: "",
  showLogo: true,
  showBankDetails: true,
  showSignature: true,
  signatureLabel: "Authorised Signatory",
};

const layouts = [
  { value: "CLASSIC", label: "Classic: logo left, details right, coloured table header" },
  { value: "MODERN", label: "Modern: full-width coloured header band" },
  { value: "MINIMAL", label: "Minimal: monochrome, thin rules" },
];

export function TemplatesSettings() {
  const templates = useAsync(() => api.get<InvoiceTemplate[]>("/settings/templates"), []);
  const company = useAsync(() => api.get<CompanySettings>("/settings/company"), []);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);

  if (templates.error) return <Alert>{templates.error}</Alert>;
  if (!templates.data) return <Spinner />;

  const selected = selectedId === "new" ? null : (templates.data.find((t) => t.id === selectedId) ?? templates.data[0] ?? null);
  const showEditor = selectedId === "new" || selected;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit">
        <CardHeader
          title="Templates"
          action={
            <Button size="sm" variant="secondary" onClick={() => setSelectedId("new")} aria-label="New template">
              <Plus className="size-4" />
            </Button>
          }
        />
        <ul className="p-2">
          {templates.data.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setSelectedId(t.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selected?.id === t.id && selectedId !== "new" ? "bg-accent-soft font-medium" : "hover:bg-page"}`}
              >
                <span className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: t.primaryColor }} />
                  {t.name}
                </span>
                {company.data?.activeTemplateId === t.id && <Badge tone="accent">Active</Badge>}
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-3 text-xs text-muted">Choose the active template in the Company tab.</p>
      </Card>

      {showEditor ? (
        <TemplateEditor
          key={selected?.id ?? "new"}
          template={selectedId === "new" ? null : selected}
          isActive={company.data?.activeTemplateId === selected?.id}
          onSaved={(id) => {
            setSelectedId(id);
            templates.reload();
          }}
          onDeleted={() => {
            setSelectedId(null);
            templates.reload();
          }}
        />
      ) : (
        <Card>
          <EmptyState title="No templates" description="Create a template to control how invoice PDFs look." />
        </Card>
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  isActive,
  onSaved,
  onDeleted,
}: {
  template: InvoiceTemplate | null;
  isActive: boolean;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const { notify } = useToast();
  const form = useForm(toFormValues(defaults, template as unknown as Record<string, unknown>));
  const [current, setCurrent] = useState(template);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() =>
      current ? api.put<InvoiceTemplate>(`/settings/templates/${current.id}`, form.values) : api.post<InvoiceTemplate>("/settings/templates", form.values),
    );
    if (saved) {
      setCurrent(saved);
      notify("Template saved");
      onSaved(saved.id);
    }
  }

  async function remove() {
    if (!current) return;
    setDeleting(true);
    try {
      await api.delete(`/settings/templates/${current.id}`);
      notify("Template deleted");
      onDeleted();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={current ? current.name : "New template"}
        description="Invoice PDFs are generated from saved invoice data using this template."
        action={
          current && (
            <div className="flex gap-2">
              <a href={api.url(`/settings/templates/${current.id}/preview`)} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">
                  <Eye className="size-4" /> Preview PDF
                </Button>
              </a>
              {!isActive && (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label="Delete template">
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          )
        }
      />
      <form onSubmit={onSubmit} className="space-y-6 p-5" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormSection title="Design">
          <FormGrid>
            <TextField form={form} name="name" label="Template name" required />
            <SelectField form={form} name="layout" label="Layout" options={layouts} />
            <TextField form={form} name="primaryColor" label="Primary colour" type="color" />
            <TextField form={form} name="accentColor" label="Accent colour" type="color" />
          </FormGrid>
        </FormSection>
        <FormSection title="Content">
          <div className="space-y-4">
            <TextField form={form} name="headerText" label="Header text" hint='Shown under the "TAX INVOICE" / "INVOICE" title, e.g. a tagline.' />
            <TextAreaField form={form} name="termsText" label="Terms & conditions" rows={3} />
            <TextAreaField form={form} name="footerText" label="Footer text" rows={2} />
          </div>
        </FormSection>
        <FormSection title="Sections">
          <FormGrid>
            <CheckboxField form={form} name="showLogo" label="Show company logo" />
            <CheckboxField form={form} name="showBankDetails" label="Show bank details" />
            <CheckboxField form={form} name="showSignature" label="Show signature area" />
            <TextField form={form} name="signatureLabel" label="Signature label" required />
          </FormGrid>
        </FormSection>
        {current && (
          <FormSection title="Files">
            <div className="grid gap-4 sm:grid-cols-2">
              <TemplateFile
                template={current}
                kind="signature"
                label="Signature image"
                hint="PNG or JPEG. Printed above the signature label."
                accept="image/png,image/jpeg"
                onChange={setCurrent}
              />
              <TemplateFile
                template={current}
                kind="reference"
                label="Reference design"
                hint="Your existing invoice as a PDF or image, kept here for comparison while adjusting the template."
                accept="application/pdf,image/png,image/jpeg"
                onChange={setCurrent}
              />
            </div>
          </FormSection>
        )}
        <div className="flex justify-end">
          <Button type="submit" loading={form.submitting}>
            Save template
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete template?"
        message="Templates already used by invoices cannot be deleted."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Card>
  );
}

function TemplateFile({
  template,
  kind,
  label,
  hint,
  accept,
  onChange,
}: {
  template: InvoiceTemplate;
  kind: "signature" | "reference";
  label: string;
  hint: string;
  accept: string;
  onChange: (template: InvoiceTemplate) => void;
}) {
  const { notify } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const file = template[kind];

  async function upload(selected: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", selected);
      onChange(await api.post<InvoiceTemplate>(`/settings/templates/${template.id}/${kind}`, body));
      notify(`${label} uploaded`);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      onChange(await api.delete<InvoiceTemplate>(`/settings/templates/${template.id}/${kind}`));
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="text-xs text-muted">{hint}</p>
      {file && (
        <FileLink
          file={file}
          actions={
            <button type="button" onClick={remove} disabled={busy} className="rounded p-1 text-muted hover:bg-page hover:text-danger" title="Remove">
              <Trash2 className="size-4" />
            </button>
          }
        />
      )}
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>
        <Upload className="size-4" /> {file ? "Replace" : "Upload"}
      </Button>
    </div>
  );
}
