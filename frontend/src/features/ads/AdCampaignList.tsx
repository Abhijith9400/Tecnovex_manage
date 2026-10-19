"use client";

import { ExternalLink, Plus } from "@/components/ui/icons";
import { CreativeThumb } from "@/features/creatives/CreativeThumb";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Feedback";
import { CsvButton, DateRange } from "@/components/ui/Filters";
import { StatusBadge } from "@/components/ui/Misc";
import { useAuth } from "@/features/auth/AuthProvider";
import { api } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { roleGroups } from "@/lib/navigation";
import { enumOptions, useClientOptions } from "@/lib/options";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PaginationMeta } from "@/types/api";
import type { AdCampaign, AdMetrics } from "@/types/models";
import { AD_PLATFORMS, AD_STATUSES, AD_TYPES, AdCampaignFormModal, platformLabel } from "./AdCampaignForm";

interface Totals extends AdMetrics {
  spend: string;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
}

const number = new Intl.NumberFormat("en-IN");

export function AdCampaignList({ clientId }: { clientId?: string }) {
  const { hasRole } = useAuth();
  const canEdit = hasRole(["ADMIN", "MANAGER", "EMPLOYEE"]);
  // Employees can delete too; the request goes to a manager for approval.
  const canDelete = hasRole(roleGroups.WORK);
  const clients = useClientOptions(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ clientId: "", platform: "", campaignType: "", status: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdCampaign | "new" | null>(null);
  const debounced = useDebounced(search);
  const query = { ...filters, clientId: clientId ?? filters.clientId, search: debounced };
  const campaigns = useAsync(() => api.list<AdCampaign>("/ad-campaigns", { ...query, page }), [JSON.stringify(query), page]);
  const totals = (campaigns.data?.meta as (PaginationMeta & { totals?: Totals }) | undefined)?.totals;

  function setFilter(patch: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total spend" value={totals ? formatCurrency(totals.spend) : "…"} hint="For the filtered campaigns" />
        <StatCard label="Impressions" value={totals ? number.format(totals.impressions) : "…"} hint={totals?.cpm ? `CPM ${formatCurrency(totals.cpm)}` : undefined} />
        <StatCard label="Clicks" value={totals ? number.format(totals.clicks) : "…"} hint={totals?.ctr ? `CTR ${totals.ctr}%` : undefined} />
        <StatCard label="Results" value={totals ? number.format(totals.results) : "…"} />
        <StatCard label="Cost per result" value={totals?.costPerResult ? formatCurrency(totals.costPerResult) : "—"} />
      </div>
      <Card>
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Campaign, objective, ID…"
          />
          {!clientId && <FilterSelect label="Client" value={filters.clientId} onChange={(v) => setFilter({ clientId: v })} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />}
          <FilterSelect label="Platform" value={filters.platform} onChange={(v) => setFilter({ platform: v })} options={AD_PLATFORMS.map((p) => ({ value: p, label: platformLabel[p] }))} />
          <FilterSelect label="Type" value={filters.campaignType} onChange={(v) => setFilter({ campaignType: v })} options={enumOptions(AD_TYPES)} />
          <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter({ status: v })} options={enumOptions(AD_STATUSES)} />
          <DateRange from={filters.from} to={filters.to} onChange={(r) => setFilter(r)} />
          <div className="flex gap-2 sm:ml-auto">
            <CsvButton href={api.url("/ad-campaigns", { ...query, format: "csv" })} />
            {canEdit && (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus className="size-4" /> Add campaign
              </Button>
            )}
          </div>
        </Toolbar>
        <DataTable
          rows={campaigns.data?.items}
          loading={campaigns.loading}
          error={campaigns.error}
          onRowClick={setEditing}
          emptyTitle="No ad campaigns"
          emptyDescription="Record post boosts, reel boosts and Meta / Google ad campaigns with their spend and results."
          columns={[
            {
              header: "Campaign",
              cell: (c) => (
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted">{[!clientId && c.client?.name, humanize(c.campaignType)].filter(Boolean).join(" · ")}</p>
                </div>
              ),
            },
            {
              header: "Boosted",
              cell: (c) =>
                c.creative ? (
                  <div className="flex min-w-40 items-center gap-2">
                    <CreativeThumb files={c.creative.files} className="size-10 shrink-0 rounded-md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{c.creative.title}</p>
                      <p className="text-xs text-muted">{humanize(c.creative.contentType)}</p>
                    </div>
                  </div>
                ) : c.postUrl ? (
                  <a href={c.postUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                    <ExternalLink className="size-3.5" /> Post link
                  </a>
                ) : (
                  <span className="text-muted">—</span>
                ),
            },
            { header: "Platform", cell: (c) => platformLabel[c.platform]?.split(" (")[0] ?? c.platform },
            { header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
            { header: "Dates", cell: (c) => <span className="whitespace-nowrap">{`${formatDate(c.startDate)} – ${c.endDate ? formatDate(c.endDate) : "ongoing"}`}</span> },
            {
              header: "Spend",
              align: "right",
              cell: (c) => (
                <div>
                  <p className="font-medium">{formatCurrency(c.spend)}</p>
                  {c.paidFrom === "AGENCY_PAID" && <Badge tone="accent">Agency paid</Badge>}
                </div>
              ),
            },
            { header: "Impr.", align: "right", cell: (c) => number.format(c.impressions) },
            { header: "Clicks", align: "right", cell: (c) => number.format(c.clicks) },
            { header: "CTR", align: "right", cell: (c) => (c.metrics.ctr ? `${c.metrics.ctr}%` : "—") },
            {
              header: "Results",
              align: "right",
              cell: (c) => (
                <div>
                  <p>{number.format(c.results)}</p>
                  {c.resultLabel && <p className="text-xs text-muted">{c.resultLabel}</p>}
                </div>
              ),
            },
            { header: "Cost / result", align: "right", cell: (c) => (c.metrics.costPerResult ? formatCurrency(c.metrics.costPerResult) : "—") },
          ]}
        />
        <Pagination meta={campaigns.data?.meta} onPage={setPage} />
      </Card>
      {editing && (
        <AdCampaignFormModal
          campaign={editing === "new" ? null : editing}
          clientId={clientId}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            campaigns.reload();
          }}
        />
      )}
    </>
  );
}
