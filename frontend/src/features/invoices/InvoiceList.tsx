"use client";

import { Plus, Repeat } from "@/components/ui/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { CsvButton, DateRange, MonthPicker } from "@/components/ui/Filters";
import { StatusBadge } from "@/components/ui/Misc";
import { api } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { periodLabel } from "@/lib/labels";
import { enumOptions, useClientOptions } from "@/lib/options";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Invoice } from "@/types/models";
import { GenerateInvoiceModal } from "./GenerateInvoiceModal";

export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"] as const;

export function InvoiceList({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const clients = useClientOptions(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "", clientId: "", billingPeriod: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [generating, setGenerating] = useState(false);
  const debounced = useDebounced(search);
  const query = { ...filters, clientId: clientId ?? filters.clientId, search: debounced };

  const invoices = useAsync(() => api.list<Invoice>("/invoices", { ...query, page }), [JSON.stringify(query), page]);

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
          placeholder="Search number or client…"
        />
        <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter({ status: v })} options={enumOptions(INVOICE_STATUSES)} />
        {!clientId && <FilterSelect label="Client" value={filters.clientId} onChange={(v) => setFilter({ clientId: v })} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />}
        <MonthPicker label="Billing month" value={filters.billingPeriod} onChange={(v) => setFilter({ billingPeriod: v })} />
        <DateRange from={filters.from} to={filters.to} onChange={(r) => setFilter(r)} />
        <div className="flex gap-2 sm:ml-auto">
          <CsvButton href={api.url("/invoices", { ...query, format: "csv" })} />
          <Button size="sm" variant="secondary" onClick={() => setGenerating(true)}>
            <Repeat className="size-4" /> Generate
          </Button>
          <Link href={clientId ? `/invoices/new?clientId=${clientId}` : "/invoices/new"}>
            <Button size="sm">
              <Plus className="size-4" /> New invoice
            </Button>
          </Link>
        </div>
      </Toolbar>
      <DataTable
        rows={invoices.data?.items}
        loading={invoices.loading}
        error={invoices.error}
        onRowClick={(i) => router.push(`/invoices/${i.id}`)}
        emptyTitle="No invoices found"
        emptyDescription="Create an invoice manually or generate one from a client's recurring services."
        columns={[
          { header: "Invoice", cell: (i) => <span className="font-medium">{i.invoiceNumber ?? <span className="text-muted">Draft</span>}</span> },
          ...(clientId ? [] : [{ header: "Client", cell: (i: Invoice) => i.client?.name ?? i.billToName }]),
          { header: "Period", cell: (i) => periodLabel(i.billingPeriod) },
          { header: "Issued", cell: (i) => formatDate(i.issueDate) },
          { header: "Due", cell: (i) => formatDate(i.dueDate) },
          { header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
          { header: "Total", align: "right", cell: (i) => formatCurrency(i.total, i.currency) },
          { header: "Balance", align: "right", cell: (i) => (i.status === "CANCELLED" || i.status === "DRAFT" ? "—" : formatCurrency(i.balanceDue, i.currency)) },
        ]}
      />
      <Pagination meta={invoices.data?.meta} onPage={setPage} />
      {generating && <GenerateInvoiceModal clientId={clientId} onClose={() => setGenerating(false)} onDone={invoices.reload} />}
    </Card>
  );
}
