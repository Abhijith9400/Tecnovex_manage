"use client";

import { ArrowLeft, Ban, CreditCard, Download, Eye, FilePenLine, Pencil, Printer, Send, Trash2 } from "@/components/ui/icons";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { Alert, Spinner } from "@/components/ui/Feedback";
import { TextAreaField, TextField } from "@/components/ui/FormFields";
import { StatusBadge } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { ReasonModal } from "@/components/ui/ReasonModal";
import { useToast } from "@/components/ui/Toast";
import { RecordPaymentModal } from "@/features/payments/RecordPaymentModal";
import { VoidPaymentModal } from "@/features/payments/VoidPaymentModal";
import { api, errorMessage } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import { humanize, periodLabel } from "@/lib/labels";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Invoice, Payment } from "@/types/models";

type Dialog = "issue" | "delete" | "cancel" | "revise" | "pay" | "details" | null;

export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const invoice = useAsync(() => api.get<Invoice>(`/invoices/${id}`), [id]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

  if (invoice.error) return <Alert>{invoice.error}</Alert>;
  if (!invoice.data) return <Spinner />;
  const inv = invoice.data;
  const open = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status);
  const hasPayments = Number(inv.amountPaid) > 0;
  const pdfUrl = api.url(`/invoices/${inv.id}/pdf`);

  async function act(action: () => Promise<Invoice | unknown>, message: string, next?: (result: Invoice) => void) {
    setBusy(true);
    try {
      const result = await action();
      notify(message);
      setDialog(null);
      if (next) next(result as Invoice);
      else invoice.reload();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/invoices" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Invoices
      </Link>
      <PageHeader
        title={inv.invoiceNumber ?? "Draft invoice"}
        description={`${inv.billToName}${inv.billingPeriod ? ` · ${periodLabel(inv.billingPeriod)}` : ""}`}
        actions={
          <>
            <StatusBadge status={inv.status} />
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                {inv.status === "DRAFT" ? <Eye className="size-4" /> : <Printer className="size-4" />} {inv.status === "DRAFT" ? "Preview" : "View / print"}
              </Button>
            </a>
            {inv.status !== "DRAFT" && (
              <a href={api.url(`/invoices/${inv.id}/pdf`, { download: 1 })}>
                <Button variant="secondary" size="sm">
                  <Download className="size-4" /> PDF
                </Button>
              </a>
            )}
            {inv.status === "DRAFT" && (
              <>
                <Link href={`/invoices/${inv.id}/edit`}>
                  <Button variant="secondary" size="sm">
                    <Pencil className="size-4" /> Edit
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => setDialog("delete")}>
                  <Trash2 className="size-4" /> Delete
                </Button>
                <Button size="sm" onClick={() => setDialog("issue")}>
                  <Send className="size-4" /> Issue invoice
                </Button>
              </>
            )}
            {open && (
              <Button size="sm" onClick={() => setDialog("pay")}>
                <CreditCard className="size-4" /> Record payment
              </Button>
            )}
          </>
        }
      />

      {inv.status === "CANCELLED" && (
        <div className="mb-4">
          <Alert>
            Cancelled on {formatDate(inv.cancelledAt)}: {inv.cancelReason}
            {inv.revisedBy && (
              <>
                {" "}
                · Replaced by{" "}
                <Link className="font-medium underline" href={`/invoices/${inv.revisedBy.id}`}>
                  {inv.revisedBy.invoiceNumber ?? "draft revision"}
                </Link>
              </>
            )}
          </Alert>
        </div>
      )}
      {inv.revisedFrom && (
        <div className="mb-4">
          <Alert variant="info">
            Revision of{" "}
            <Link className="font-medium underline" href={`/invoices/${inv.revisedFrom.id}`}>
              {inv.revisedFrom.invoiceNumber}
            </Link>
            .
          </Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <div className="grid gap-6 p-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted uppercase">Bill to</p>
                <p className="mt-1 font-semibold">{inv.billToName}</p>
                <p className="text-sm whitespace-pre-line text-muted">{inv.billToAddress}</p>
                {inv.billToGstin && <p className="text-sm text-muted">GSTIN: {inv.billToGstin}</p>}
                {inv.billToEmail && <p className="text-sm text-muted">{inv.billToEmail}</p>}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted">Invoice date</dt>
                <dd className="text-right">{formatDate(inv.issueDate)}</dd>
                <dt className="text-muted">Due date</dt>
                <dd className="text-right">{formatDate(inv.dueDate)}</dd>
                <dt className="text-muted">Billing month</dt>
                <dd className="text-right">{periodLabel(inv.billingPeriod)}</dd>
                <dt className="text-muted">Client</dt>
                <dd className="text-right">
                  <Link className="text-accent hover:underline" href={`/clients/${inv.clientId}`}>
                    {inv.client?.name}
                  </Link>
                </dd>
              </dl>
            </div>
            <DataTable
              rows={inv.items}
              columns={[
                {
                  header: "Description",
                  cell: (i) => (
                    <div>
                      <p>{i.description}</p>
                      {i.sacCode && <p className="text-xs text-muted">SAC {i.sacCode}</p>}
                    </div>
                  ),
                },
                { header: "Qty", align: "right", cell: (i) => Number(i.quantity) },
                { header: "Rate", align: "right", cell: (i) => formatCurrency(i.unitPrice, inv.currency) },
                { header: "Discount", align: "right", cell: (i) => (Number(i.discount) ? formatCurrency(i.discount, inv.currency) : "—") },
                { header: "Tax", align: "right", cell: (i) => `${Number(i.taxRate)}% · ${formatCurrency(i.taxAmount, inv.currency)}` },
                { header: "Amount", align: "right", cell: (i) => formatCurrency(i.lineTotal, inv.currency) },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Payments" description="Each payment generates a receipt. Voided payments stay on record." />
            <DataTable
              rows={inv.payments}
              emptyTitle="No payments recorded"
              columns={[
                { header: "Receipt", cell: (p) => <span className="font-medium">{p.receiptNumber}</span> },
                { header: "Date", cell: (p) => formatDate(p.paymentDate) },
                { header: "Method", cell: (p) => humanize(p.method) },
                { header: "Reference", cell: (p) => p.reference ?? "—" },
                { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
                { header: "Amount", align: "right", cell: (p) => formatCurrency(p.amount, inv.currency) },
                {
                  header: "",
                  align: "right",
                  cell: (p) => (
                    <div className="flex justify-end gap-2 text-xs">
                      <a className="text-accent hover:underline" href={api.url(`/payments/${p.id}/receipt`)} target="_blank" rel="noopener noreferrer">
                        Receipt
                      </a>
                      {p.proof && (
                        <a className="text-accent hover:underline" href={api.fileUrl(p.proof.id)} target="_blank" rel="noopener noreferrer">
                          Proof
                        </a>
                      )}
                      {p.status === "RECORDED" && (
                        <button className="text-muted hover:text-danger" onClick={() => setVoiding(p)}>
                          Void
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </Card>
          {(inv.notes || inv.terms) && (
            <Card className="grid gap-4 p-5 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted uppercase">Notes</p>
                <p className="mt-1 whitespace-pre-line">{inv.notes ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted uppercase">Terms</p>
                <p className="mt-1 whitespace-pre-line">{inv.terms ?? "—"}</p>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatCurrency(inv.subtotal, inv.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Discount</dt>
                <dd className="tabular-nums">− {formatCurrency(inv.discountTotal, inv.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Tax</dt>
                <dd className="tabular-nums">{formatCurrency(inv.taxTotal, inv.currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCurrency(inv.total, inv.currency)}</dd>
              </div>
              {inv.status !== "DRAFT" && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted">Paid</dt>
                    <dd className="tabular-nums text-success">{formatCurrency(inv.amountPaid, inv.currency)}</dd>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <dt>Balance due</dt>
                    <dd className="tabular-nums">{formatCurrency(inv.status === "CANCELLED" ? 0 : inv.balanceDue, inv.currency)}</dd>
                  </div>
                </>
              )}
            </dl>
          </Card>
          {(open || inv.status === "PAID") && (
            <Card className="space-y-2 p-4">
              <p className="text-xs font-medium text-muted uppercase">Corrections</p>
              <Button variant="secondary" size="sm" className="w-full" onClick={() => setDialog("details")}>
                <FilePenLine className="size-4" /> Edit due date / notes
              </Button>
              {open && (
                <>
                  <Button variant="secondary" size="sm" className="w-full" disabled={hasPayments} onClick={() => setDialog("revise")}>
                    <Pencil className="size-4" /> Revise (cancel &amp; copy)
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full" disabled={hasPayments} onClick={() => setDialog("cancel")}>
                    <Ban className="size-4" /> Cancel invoice
                  </Button>
                  {hasPayments && <p className="text-xs text-muted">Void recorded payments before revising or cancelling.</p>}
                </>
              )}
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "issue"}
        title="Issue this invoice?"
        message="A sequential invoice number will be assigned and the amounts, client and company details will be locked. Corrections after this require Revise."
        confirmLabel="Issue invoice"
        loading={busy}
        onConfirm={() => act(() => api.post(`/invoices/${inv.id}/issue`), "Invoice issued")}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete this draft?"
        message="Drafts have no invoice number yet, so deleting leaves no gap in numbering."
        confirmLabel="Delete draft"
        destructive
        loading={busy}
        onConfirm={() => act(() => api.delete(`/invoices/${inv.id}`), "Draft deleted", () => router.push("/invoices"))}
        onCancel={() => setDialog(null)}
      />
      {(dialog === "cancel" || dialog === "revise") && (
        <ReasonModal
          title={dialog === "cancel" ? "Cancel invoice" : "Revise invoice"}
          description={
            dialog === "cancel"
              ? "The invoice stays on record as Cancelled with its number. This cannot be undone."
              : "This invoice will be cancelled (keeping its number for the audit trail) and an editable draft copy created. The draft gets a new number when issued."
          }
          confirmLabel={dialog === "cancel" ? "Cancel invoice" : "Revise"}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            dialog === "cancel"
              ? act(() => api.post(`/invoices/${inv.id}/cancel`, { reason }), "Invoice cancelled")
              : act(() => api.post<Invoice>(`/invoices/${inv.id}/revise`, { reason }), "Draft revision created", (draft) => router.push(`/invoices/${draft.id}/edit`))
          }
        />
      )}
      {dialog === "details" && (
        <IssuedDetailsModal
          invoice={inv}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            invoice.reload();
          }}
        />
      )}
      {dialog === "pay" && (
        <RecordPaymentModal
          invoice={inv}
          onClose={() => setDialog(null)}
          onRecorded={() => {
            setDialog(null);
            invoice.reload();
          }}
        />
      )}
      {voiding && (
        <VoidPaymentModal
          payment={voiding}
          onClose={() => setVoiding(null)}
          onVoided={() => {
            setVoiding(null);
            invoice.reload();
          }}
        />
      )}
    </>
  );
}

function IssuedDetailsModal({ invoice, onClose, onSaved }: { invoice: Invoice; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const form = useForm(toFormValues({ dueDate: "", notes: "", terms: "" }, invoice as unknown as Record<string, unknown>));
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() => api.patch(`/invoices/${invoice.id}`, form.values));
    if (saved) {
      notify("Invoice details updated");
      onSaved();
    }
  }
  return (
    <Modal
      open
      title="Edit due date and notes"
      description="Amounts cannot change after issue. Use Revise to correct line items."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="issued-form" loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="issued-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <TextField form={form} name="dueDate" label="Due date" type="date" required />
        <TextAreaField form={form} name="notes" label="Notes" />
        <TextAreaField form={form} name="terms" label="Terms" />
      </form>
    </Modal>
  );
}
