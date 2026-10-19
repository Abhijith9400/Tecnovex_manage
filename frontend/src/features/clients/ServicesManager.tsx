"use client";

import { Pencil, Plus, Trash2 } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { Alert, Badge } from "@/components/ui/Feedback";
import { CheckboxField, FormGrid, MoneyField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { formatCurrency } from "@/lib/utils";
import type { Service } from "@/types/models";

/** Billable services for a client. Active recurring services drive monthly invoice generation. */
export function ServicesManager({ clientId, services, canEdit, onChanged }: { clientId: string; services: Service[]; canEdit: boolean; onChanged: () => void }) {
  const { notify } = useToast();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [removing, setRemoving] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      const result = await api.delete<{ deactivated: boolean }>(`/clients/${clientId}/services/${removing.id}`);
      notify(result.deactivated ? "Service deactivated (it appears on past invoices)" : "Service removed");
      onChanged();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Services & pricing"
        description="Active recurring services are added automatically when you generate a monthly invoice."
        action={
          canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add service
            </Button>
          )
        }
      />
      <DataTable
        rows={services}
        emptyTitle="No services yet"
        emptyDescription="Add the services you provide to this client, with their price and tax rate."
        columns={[
          {
            header: "Service",
            cell: (s) => (
              <div className={s.isActive ? "" : "opacity-60"}>
                <p className="font-medium">{s.name}</p>
                {s.description && <p className="text-xs text-muted">{s.description}</p>}
              </div>
            ),
          },
          { header: "Qty", align: "right", cell: (s) => Number(s.quantity) },
          { header: "Unit price", align: "right", cell: (s) => formatCurrency(s.unitPrice) },
          { header: "Tax", align: "right", cell: (s) => `${Number(s.taxRate)}%` },
          {
            header: "Type",
            cell: (s) => (
              <div className="flex gap-1">
                {s.isRecurring ? <Badge tone="accent">Recurring</Badge> : <Badge>One-time</Badge>}
                {!s.isActive && <Badge>Inactive</Badge>}
              </div>
            ),
          },
          {
            header: "",
            align: "right",
            cell: (s) =>
              canEdit && (
                <div className="flex justify-end gap-1">
                  <button onClick={() => setEditing(s)} className="rounded p-1.5 text-muted hover:bg-page hover:text-ink" aria-label={`Edit ${s.name}`}>
                    <Pencil className="size-4" />
                  </button>
                  <button onClick={() => setRemoving(s)} className="rounded p-1.5 text-muted hover:bg-page hover:text-danger" aria-label={`Remove ${s.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ),
          },
        ]}
      />
      {editing && (
        <ServiceModal
          clientId={clientId}
          service={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove service?"
        message="Services already used on invoices are deactivated instead of deleted, so past invoices stay intact."
        confirmLabel="Remove"
        destructive
        loading={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

function ServiceModal({ clientId, service, onClose, onSaved }: { clientId: string; service: Service | null; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const form = useForm(
    toFormValues({ name: "", description: "", sacCode: "", quantity: "1", unitPrice: "", taxRate: "0", isRecurring: true, isActive: true }, service as unknown as Record<string, unknown>),
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() =>
      service ? api.put(`/clients/${clientId}/services/${service.id}`, form.values) : api.post(`/clients/${clientId}/services`, form.values),
    );
    if (saved) {
      notify("Service saved");
      onSaved();
    }
  }

  return (
    <Modal
      open
      title={service ? "Edit service" : "Add service"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="service-form" loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="service-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <TextField form={form} name="name" label="Service name" required />
        <TextAreaField form={form} name="description" label="Description (shown on invoices)" rows={2} />
        <FormGrid>
          <TextField form={form} name="quantity" label="Quantity" type="number" step="0.01" min="0" required />
          <MoneyField form={form} name="unitPrice" label="Unit price" required />
          <TextField form={form} name="taxRate" label="Tax rate (%)" type="number" step="0.01" min="0" max="100" />
          <TextField form={form} name="sacCode" label="SAC / HSN code" />
          <CheckboxField form={form} name="isRecurring" label="Recurring (bill every period)" />
          <CheckboxField form={form} name="isActive" label="Active" />
        </FormGrid>
      </form>
    </Modal>
  );
}
