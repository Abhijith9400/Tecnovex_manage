"use client";

import { Paperclip, Plus } from "@/components/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Misc";
import { useAuth } from "@/features/auth/AuthProvider";
import { api } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { roleGroups } from "@/lib/navigation";
import { enumOptions, useClientOptions } from "@/lib/options";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Agreement } from "@/types/models";
import { AgreementDetailModal, RenewalBadge } from "./AgreementDetail";
import { AGREEMENT_STATUSES, AgreementFormModal } from "./AgreementForm";

export function AgreementList({ clientId }: { clientId?: string }) {
  const { hasRole } = useAuth();
  const clients = useClientOptions();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ clientId: "", status: "", renewal: "", archived: false });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Agreement | null>(null);
  const debounced = useDebounced(search);

  const agreements = useAsync(
    () => api.list<Agreement>("/agreements", { ...filters, clientId: clientId ?? filters.clientId, search: debounced, page }),
    [clientId, filters, debounced, page],
  );

  function setFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
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
          placeholder="Search title, reference, client…"
        />
        {!clientId && <FilterSelect label="Client" value={filters.clientId} onChange={(v) => setFilter("clientId", v)} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />}
        <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter("status", v)} options={enumOptions(AGREEMENT_STATUSES)} />
        <FilterSelect
          label="Renewal"
          value={filters.renewal}
          onChange={(v) => setFilter("renewal", v)}
          options={[
            { value: "DUE_SOON", label: "Due for renewal" },
            { value: "EXPIRED", label: "Expired" },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={filters.archived} onChange={(e) => setFilter("archived", e.target.checked)} className="size-4 accent-accent" /> Archived
        </label>
        {hasRole(roleGroups.OPERATIONS) && (
          <Button size="sm" className="sm:ml-auto" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New agreement
          </Button>
        )}
      </Toolbar>
      <DataTable
        rows={agreements.data?.items}
        loading={agreements.loading}
        error={agreements.error}
        onRowClick={setSelected}
        emptyTitle="No agreements"
        emptyDescription="Record signed agreements, scope of work and renewal dates here."
        columns={[
          {
            header: "Agreement",
            cell: (a) => (
              <div>
                <p className="flex items-center gap-1.5 font-medium">
                  {a.title}
                  {a.documents.length > 0 && <Paperclip className="size-3.5 text-muted" aria-label={`${a.documents.length} documents`} />}
                </p>
                <p className="text-xs text-muted">{[!clientId && a.client?.name, a.reference].filter(Boolean).join(" · ")}</p>
              </div>
            ),
          },
          { header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
          { header: "Effective", cell: (a) => formatDate(a.effectiveDate) },
          { header: "Expiry", cell: (a) => formatDate(a.expiryDate) },
          { header: "Renewal", cell: (a) => <RenewalBadge agreement={a} /> },
          { header: "Value", align: "right", cell: (a) => formatCurrency(a.contractValue) },
        ]}
      />
      <Pagination meta={agreements.data?.meta} onPage={setPage} />
      {creating && (
        <AgreementFormModal
          agreement={null}
          clientId={clientId}
          onClose={() => setCreating(false)}
          onSaved={(a) => {
            setCreating(false);
            agreements.reload();
            setSelected(a);
          }}
        />
      )}
      {selected && (
        <AgreementDetailModal
          agreement={selected}
          onClose={() => setSelected(null)}
          onChanged={(a) => {
            setSelected(a);
            agreements.reload();
          }}
        />
      )}
    </Card>
  );
}
