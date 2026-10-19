"use client";

import { Plus, Trash2 } from "@/components/ui/icons";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Alert } from "@/components/ui/Feedback";
import { Input, Select } from "@/components/ui/Form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { useToast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import { todayInput } from "@/lib/labels";
import { useClientOptions } from "@/lib/options";
import { formatCurrency } from "@/lib/utils";
import type { Client, CompanySettings, Invoice, InvoiceTemplate } from "@/types/models";

interface Line {
  key: string;
  serviceId: string;
  description: string;
  sacCode: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
}

let lineCounter = 0;
function blankLine(taxRate = "0"): Line {
  lineCounter += 1;
  return { key: `l${lineCounter}`, serviceId: "", description: "", sacCode: "", quantity: "1", unitPrice: "", discount: "0", taxRate };
}

/** Integer-paise estimate for display only. The server recalculates and stores the real totals. */
function paise(value: string) {
  const [whole, frac = ""] = (value || "0").split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2)) * (whole.startsWith("-") ? -1 : 1);
}
function estimate(lines: Line[]) {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const l of lines) {
    const amount = Math.round((paise(l.unitPrice) * paise(l.quantity)) / 100);
    const d = paise(l.discount);
    subtotal += amount;
    discount += d;
    tax += Math.round(((amount - d) * paise(l.taxRate)) / 10000);
  }
  return { subtotal: subtotal / 100, discount: discount / 100, tax: tax / 100, total: (subtotal - discount + tax) / 100 };
}

const cellInput = "h-9 px-2";

export function InvoiceEditor({ invoice, initialClientId }: { invoice?: Invoice; initialClientId?: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const clients = useClientOptions();
  const templates = useAsync(() => api.get<InvoiceTemplate[]>("/settings/templates"), []);
  const settings = useAsync(() => api.get<CompanySettings>("/settings/company"), []);
  const defaultTax = settings.data?.isGstRegistered ? settings.data.defaultTaxRate : "0";

  const form = useForm(
    toFormValues({ clientId: initialClientId ?? "", billingPeriod: "", issueDate: todayInput(), dueDate: "", templateId: "", notes: "", terms: "" }, invoice as unknown as Record<string, unknown>),
  );
  const [lines, setLines] = useState<Line[]>(() =>
    invoice?.items?.length
      ? invoice.items.map((i) => ({
          key: i.id,
          serviceId: i.serviceId ?? "",
          description: i.description,
          sacCode: i.sacCode ?? "",
          quantity: String(Number(i.quantity)),
          unitPrice: i.unitPrice,
          discount: i.discount,
          taxRate: String(Number(i.taxRate)),
        }))
      : [blankLine()],
  );
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const client = useAsync(() => (form.values.clientId ? api.get<Client>(`/clients/${form.values.clientId}`) : Promise.resolve(null)), [form.values.clientId]);
  const services = (client.data?.services ?? []).filter((s) => s.isActive);

  function update(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addService(serviceId: string) {
    const s = services.find((x) => x.id === serviceId);
    if (!s) return;
    const line: Line = { ...blankLine(), serviceId: s.id, description: s.description ? `${s.name} - ${s.description}` : s.name, sacCode: s.sacCode ?? "", quantity: String(Number(s.quantity)), unitPrice: s.unitPrice, taxRate: String(Number(s.taxRate)) };
    setLines((current) => [...current.filter((l) => l.description || l.unitPrice), line]);
  }

  async function save(allowDuplicate = false) {
    setDuplicate(null);
    const body = {
      ...form.values,
      allowDuplicate,
      items: lines.map((l) => ({
        serviceId: l.serviceId,
        description: l.description,
        sacCode: l.sacCode,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount || "0",
        taxRate: l.taxRate || "0",
      })),
    };
    const saved = await form.submit(async () => {
      try {
        return invoice ? await api.put<Invoice>(`/invoices/${invoice.id}`, body) : await api.post<Invoice>("/invoices", body);
      } catch (error) {
        if (error instanceof ApiError && error.code === "DUPLICATE_PERIOD") {
          setDuplicate(error.message);
          return undefined;
        }
        throw error;
      }
    });
    if (saved) {
      notify(invoice ? "Draft updated" : "Draft invoice created");
      router.push(`/invoices/${saved.id}`);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  const totals = estimate(lines);
  const itemError = (index: number, field: string) => form.errors[`items.${index}.${field}`];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <PageHeader
        title={invoice ? "Edit draft invoice" : "New invoice"}
        description="Drafts can be edited freely. Once issued, totals are locked and corrections go through Revise."
        actions={
          <>
            <Button variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={form.submitting}>
              Save draft
            </Button>
          </>
        }
      />
      {form.formError && <Alert>{form.formError}</Alert>}
      <Card className="p-5">
        <FormGrid>
          <SelectField
            form={form}
            name="clientId"
            label="Client"
            required
            disabled={Boolean(invoice)}
            placeholder="Choose a client"
            options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <TextField form={form} name="billingPeriod" label="Billing month" type="month" hint="Used to prevent billing the same month twice." />
          <TextField form={form} name="issueDate" label="Invoice date" type="date" required />
          <TextField form={form} name="dueDate" label="Due date" type="date" hint={client.data ? `Defaults to ${client.data.paymentTermsDays} days after the invoice date.` : undefined} />
          <SelectField
            form={form}
            name="templateId"
            label="Template"
            placeholder="Company default"
            options={(templates.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          />
        </FormGrid>
      </Card>

      <Card>
        <CardHeader
          title="Line items"
          action={
            services.length > 0 && (
              <Select aria-label="Add a client service" value="" onChange={(e) => addService(e.target.value)} className="h-9 w-56">
                <option value="">+ Add client service…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatCurrency(s.unitPrice)})
                  </option>
                ))}
              </Select>
            )
          }
        />
        {form.errors.items && (
          <div className="px-4 pt-3">
            <Alert>{form.errors.items}</Alert>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium text-muted uppercase">
                <th className="px-3 py-2">Description</th>
                <th className="w-24 px-2 py-2">SAC</th>
                <th className="w-20 px-2 py-2 text-right">Qty</th>
                <th className="w-32 px-2 py-2 text-right">Rate</th>
                <th className="w-28 px-2 py-2 text-right">Discount</th>
                <th className="w-20 px-2 py-2 text-right">Tax %</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key} className="border-b border-line align-top">
                  <td className="px-3 py-2">
                    <Input
                      className={cellInput}
                      value={line.description}
                      onChange={(e) => update(line.key, { description: e.target.value })}
                      placeholder="Description"
                      aria-label={`Line ${index + 1} description`}
                      aria-invalid={Boolean(itemError(index, "description"))}
                    />
                    {itemError(index, "description") && <p className="mt-1 text-xs text-danger">{itemError(index, "description")}</p>}
                  </td>
                  <td className="px-2 py-2">
                    <Input className={cellInput} value={line.sacCode} onChange={(e) => update(line.key, { sacCode: e.target.value })} aria-label={`Line ${index + 1} SAC code`} />
                  </td>
                  <td className="px-2 py-2">
                    <Input className={`${cellInput} text-right`} type="number" step="0.01" min="0" value={line.quantity} onChange={(e) => update(line.key, { quantity: e.target.value })} aria-label={`Line ${index + 1} quantity`} aria-invalid={Boolean(itemError(index, "quantity"))} />
                  </td>
                  <td className="px-2 py-2">
                    <Input className={`${cellInput} text-right`} type="number" step="0.01" min="0" value={line.unitPrice} onChange={(e) => update(line.key, { unitPrice: e.target.value })} aria-label={`Line ${index + 1} rate`} aria-invalid={Boolean(itemError(index, "unitPrice"))} />
                    {itemError(index, "unitPrice") && <p className="mt-1 text-xs text-danger">{itemError(index, "unitPrice")}</p>}
                  </td>
                  <td className="px-2 py-2">
                    <Input className={`${cellInput} text-right`} type="number" step="0.01" min="0" value={line.discount} onChange={(e) => update(line.key, { discount: e.target.value })} aria-label={`Line ${index + 1} discount`} />
                  </td>
                  <td className="px-2 py-2">
                    <Input className={`${cellInput} text-right`} type="number" step="0.01" min="0" max="100" value={line.taxRate} onChange={(e) => update(line.key, { taxRate: e.target.value })} aria-label={`Line ${index + 1} tax rate`} />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setLines((current) => (current.length > 1 ? current.filter((l) => l.key !== line.key) : current))}
                      className="rounded p-2 text-muted hover:bg-page hover:text-danger disabled:opacity-30"
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:justify-between">
          <Button variant="secondary" size="sm" onClick={() => setLines((current) => [...current, blankLine(defaultTax)])}>
            <Plus className="size-4" /> Add line
          </Button>
          <dl className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums">{formatCurrency(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Discount</dt>
              <dd className="tabular-nums">− {formatCurrency(totals.discount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Tax</dt>
              <dd className="tabular-nums">{formatCurrency(totals.tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1 font-semibold">
              <dt>Estimated total</dt>
              <dd className="tabular-nums">{formatCurrency(totals.total)}</dd>
            </div>
            <p className="pt-1 text-xs text-muted">Final totals are calculated by the server when you save.</p>
          </dl>
        </div>
      </Card>

      <Card className="grid gap-4 p-5 md:grid-cols-2">
        <TextAreaField form={form} name="notes" label="Notes" rows={3} />
        <TextAreaField form={form} name="terms" label="Terms" rows={3} />
      </Card>

      <ConfirmDialog
        open={Boolean(duplicate)}
        title="Possible duplicate invoice"
        message={`${duplicate ?? ""} Saving another may bill the client twice for the same month.`}
        confirmLabel="Save anyway"
        onConfirm={() => save(true)}
        onCancel={() => setDuplicate(null)}
      />
    </form>
  );
}
