"use client";

import { Plus } from "@/components/ui/icons";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { CsvButton, DateRange } from "@/components/ui/Filters";
import { StatusBadge } from "@/components/ui/Misc";
import { useAuth } from "@/features/auth/AuthProvider";
import { api } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { humanize, paymentMethods } from "@/lib/labels";
import { enumOptions, useClientOptions } from "@/lib/options";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Payment } from "@/types/models";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { VoidPaymentModal } from "./VoidPaymentModal";

export function PaymentList({ clientId }: { clientId?: string }) {
  const clients = useClientOptions(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ clientId: "", method: "", status: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  // Managers add payments (for approval) but cannot void them.
  const canVoid = useAuth().hasRole(["ADMIN", "ACCOUNTANT"]);
  const debounced = useDebounced(search);
  const query = { ...filters, clientId: clientId ?? filters.clientId, search: debounced };
  const payments = useAsync(() => api.list<Payment>("/payments", { ...query, page }), [JSON.stringify(query), page]);

  function setFilter(patch: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  return (
    <Card>
      <Toolbar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Receipt, reference, invoice…"
        />
        {!clientId && <FilterSelect label="Client" value={filters.clientId} onChange={(v) => setFilter({ clientId: v })} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />}
        <FilterSelect label="Method" value={filters.method} onChange={(v) => setFilter({ method: v })} options={enumOptions(paymentMethods)} />
        <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter({ status: v })} options={enumOptions(["RECORDED", "VOIDED"])} />
        <DateRange from={filters.from} to={filters.to} onChange={(r) => setFilter(r)} />
        <div className="flex gap-2 sm:ml-auto">
          <CsvButton href={api.url("/payments", { ...query, format: "csv" })} />
          <Button size="sm" onClick={() => setRecording(true)}>
            <Plus className="size-4" /> Record payment
          </Button>
        </div>
      </Toolbar>
      <DataTable
        rows={payments.data?.items}
        loading={payments.loading}
        error={payments.error}
        emptyTitle="No payments found"
        columns={[
          { header: "Receipt", cell: (p) => <span className="font-medium">{p.receiptNumber}</span> },
          { header: "Date", cell: (p) => formatDate(p.paymentDate) },
          ...(clientId ? [] : [{ header: "Client", cell: (p: Payment) => p.client?.name }]),
          {
            header: "Invoice",
            cell: (p) =>
              p.invoice ? (
                <Link className="text-accent hover:underline" href={`/invoices/${p.invoice.id}`}>
                  {p.invoice.invoiceNumber}
                </Link>
              ) : (
                <span className="text-muted">On account</span>
              ),
          },
          { header: "Method", cell: (p) => humanize(p.method) },
          { header: "Reference", cell: (p) => p.reference ?? "—" },
          { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
          { header: "Amount", align: "right", cell: (p) => <span className={p.status === "VOIDED" ? "text-muted line-through" : ""}>{formatCurrency(p.amount)}</span> },
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
                {p.status === "RECORDED" && canVoid && (
                  <button className="text-muted hover:text-danger" onClick={() => setVoiding(p)}>
                    Void
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
      <Pagination meta={payments.data?.meta} onPage={setPage} />
      {recording && (
        <RecordPaymentModal
          onClose={() => setRecording(false)}
          onRecorded={() => {
            setRecording(false);
            payments.reload();
          }}
        />
      )}
      {voiding && (
        <VoidPaymentModal
          payment={voiding}
          onClose={() => setVoiding(null)}
          onVoided={() => {
            setVoiding(null);
            payments.reload();
          }}
        />
      )}
    </Card>
  );
}
