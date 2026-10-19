"use client";

import { Plus } from "@/components/ui/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Misc";
import { RequireRole } from "@/features/auth/RequireRole";
import { ClientFormModal } from "@/features/clients/ClientForm";
import { api } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { roleGroups } from "@/lib/navigation";
import { enumOptions } from "@/lib/options";
import { formatCurrency } from "@/lib/utils";
import type { Client } from "@/types/models";

export default function ClientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(search);

  const clients = useAsync(() => api.list<Client>("/clients", { search: debounced, status, archived, page }), [debounced, status, archived, page]);

  return (
    <RequireRole roles={[...roleGroups.STAFF, "EMPLOYEE"]}>
      <PageHeader
        title="Clients"
        description="Client records, billing details and everything delivered for each client."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New client
          </Button>
        }
      />
      <Card>
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search name, contact, email…"
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={enumOptions(["LEAD", "ACTIVE", "ON_HOLD", "INACTIVE"])}
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => {
                setArchived(e.target.checked);
                setPage(1);
              }}
              className="size-4 accent-accent"
            />
            Show archived
          </label>
        </Toolbar>
        <DataTable
          rows={clients.data?.items}
          loading={clients.loading}
          error={clients.error}
          onRowClick={(c) => router.push(`/clients/${c.id}`)}
          emptyTitle={archived ? "No archived clients" : "No clients found"}
          emptyDescription={archived ? undefined : "Add your first client to start tracking work and billing."}
          columns={[
            {
              header: "Client",
              cell: (c) => (
                <div>
                  <p className="font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-muted">{c.contactPerson ?? c.email ?? "—"}</p>
                </div>
              ),
            },
            { header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
            { header: "Billing", cell: (c) => `${humanize(c.billingType)} · ${humanize(c.billingCycle)}` },
            {
              header: "Value",
              align: "right",
              cell: (c) => (c.billingType === "RETAINER" ? (c.monthlyRetainer ? `${formatCurrency(c.monthlyRetainer)}/mo` : "—") : formatCurrency(c.projectPrice)),
            },
            { header: "Creatives", align: "right", cell: (c) => c._count?.creatives ?? 0 },
            { header: "Invoices", align: "right", cell: (c) => c._count?.invoices ?? 0 },
          ]}
        />
        <Pagination meta={clients.data?.meta} onPage={setPage} />
      </Card>
      {creating && <ClientFormModal client={null} onClose={() => setCreating(false)} onSaved={(c) => router.push(`/clients/${c.id}`)} />}
    </RequireRole>
  );
}
