"use client";

import { Grid2X2, List, Megaphone, Upload } from "@/components/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { EmptyState, Spinner, Alert } from "@/components/ui/Feedback";
import { MonthPicker } from "@/components/ui/Filters";
import { StatusBadge } from "@/components/ui/Misc";
import { api } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { enumOptions, useClientOptions } from "@/lib/options";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { Creative } from "@/types/models";
import { CREATIVE_STATUSES, CREATIVE_TYPES, PLATFORMS } from "./constants";
import { CreativePreview } from "./CreativePreview";
import { CreativeThumb } from "./CreativeThumb";
import { CreativeUploadModal } from "./CreativeUploadModal";


/** Gallery of creatives, either for one client (client page tab) or across clients (Creative Shelf). */
export function CreativeGallery({ clientId, canUpload = true }: { clientId?: string; canUpload?: boolean }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ clientId: "", month: "", campaign: "", platform: "", contentType: "", status: "" });
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Creative | null>(null);
  const debounced = useDebounced(search);
  const clients = useClientOptions();

  const scopeClient = clientId ?? filters.clientId;
  const base = scopeClient ? `/clients/${scopeClient}/creatives` : "/creatives";
  const creatives = useAsync(
    () => api.list<Creative>(base, { ...filters, clientId: undefined, search: debounced, page, pageSize: 24 }),
    [base, debounced, page, filters],
  );
  const campaigns = useAsync(() => api.get<string[]>(`${base}/campaigns`), [base]);

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const items = creatives.data?.items;

  return (
    <Card>
      <Toolbar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search title, campaign, caption…"
        />
        {!clientId && (
          <FilterSelect label="Client" value={filters.clientId} onChange={(v) => setFilter("clientId", v)} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        )}
        <MonthPicker value={filters.month} onChange={(v) => setFilter("month", v)} />
        <FilterSelect label="Campaign" value={filters.campaign} onChange={(v) => setFilter("campaign", v)} options={(campaigns.data ?? []).map((c) => ({ value: c, label: c }))} />
        <FilterSelect label="Platform" value={filters.platform} onChange={(v) => setFilter("platform", v)} options={enumOptions(PLATFORMS)} />
        <FilterSelect label="Type" value={filters.contentType} onChange={(v) => setFilter("contentType", v)} options={enumOptions(CREATIVE_TYPES)} />
        <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter("status", v)} options={enumOptions(CREATIVE_STATUSES)} />
        <div className="flex gap-2 sm:ml-auto">
          <div className="flex rounded-lg border border-line p-0.5">
            {(["grid", "list"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={cn("rounded-md p-1.5", view === mode ? "bg-page text-ink" : "text-muted hover:text-ink")}
                aria-label={`${mode} view`}
                aria-pressed={view === mode}
              >
                {mode === "grid" ? <Grid2X2 className="size-4" /> : <List className="size-4" />}
              </button>
            ))}
          </div>
          {canUpload && (
            <Button size="sm" onClick={() => setUploading(true)}>
              <Upload className="size-4" /> Upload
            </Button>
          )}
        </div>
      </Toolbar>

      {creatives.error ? (
        <div className="p-4">
          <Alert>{creatives.error}</Alert>
        </div>
      ) : !items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          title="No creatives found"
          description={filters.status === "" ? "Archived creatives are hidden unless you filter by Archived." : "Try different filters."}
          action={
            canUpload && (
              <Button size="sm" onClick={() => setUploading(true)}>
                <Upload className="size-4" /> Upload creative
              </Button>
            )
          }
        />
      ) : view === "grid" ? (
        <div className={cn("grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6", creatives.loading && "opacity-60")}>
          {items.map((creative) => (
            <button key={creative.id} onClick={() => setSelected(creative)} className="group relative overflow-hidden rounded-lg border border-line text-left transition-shadow hover:shadow-md">
              <CreativeThumb files={creative.files} className="aspect-square" />
              {(creative.boostSummary?.count ?? 0) > 0 && (
                <span
                  className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white shadow"
                  title={`Boosted ${creative.boostSummary!.count}× · ${formatCurrency(creative.boostSummary!.spend)} spent`}
                >
                  <Megaphone className="size-3" /> Boosted
                </span>
              )}
              <div className="space-y-1 p-2.5">
                <p className="truncate text-sm font-medium text-ink">{creative.title}</p>
                <p className="truncate text-xs text-muted">{[!clientId && creative.client?.name, creative.campaign, humanize(creative.platform)].filter(Boolean).join(" · ")}</p>
                <div className="flex items-center justify-between">
                  <StatusBadge status={creative.status} />
                  <span className="text-[11px] text-muted">{formatDate(creative.publishDate ?? creative.createdAt)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <DataTable
          rows={items}
          loading={creatives.loading}
          onRowClick={setSelected}
          columns={[
            { header: "", cell: (c) => <CreativeThumb files={c.files} className="size-12 rounded" />, className: "w-16" },
            {
              header: "Title",
              cell: (c) => (
                <div>
                  <p className="font-medium">{c.title}</p>
                  {!clientId && <p className="text-xs text-muted">{c.client?.name}</p>}
                </div>
              ),
            },
            { header: "Campaign", cell: (c) => c.campaign ?? "—" },
            { header: "Type", cell: (c) => humanize(c.contentType) },
            { header: "Platform", cell: (c) => humanize(c.platform) },
            { header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
            { header: "Uploaded", cell: (c) => formatDate(c.createdAt) },
            { header: "Published", cell: (c) => formatDate(c.publishDate) },
          ]}
        />
      )}
      <Pagination meta={creatives.data?.meta} onPage={setPage} />

      {uploading && (
        <CreativeUploadModal
          clientId={clientId}
          onClose={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false);
            creatives.reload();
            campaigns.reload();
          }}
        />
      )}
      {selected && (
        <CreativePreview
          creative={selected}
          onClose={() => setSelected(null)}
          onChanged={(updated) => {
            if (updated) setSelected(updated);
            else setSelected(null);
            creatives.reload();
          }}
        />
      )}
    </Card>
  );
}
