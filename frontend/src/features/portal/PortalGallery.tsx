"use client";

import { ChevronLeft, ChevronRight, Download, FolderDown, Images } from "@/components/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { Alert, EmptyState, Spinner } from "@/components/ui/Feedback";
import { MonthPicker } from "@/components/ui/Filters";
import { StatusBadge } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { CREATIVE_TYPES, PLATFORMS } from "@/features/creatives/constants";
import { CreativeThumb, MediaPreview } from "@/features/creatives/CreativeThumb";
import { api } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { formatBytes, humanize } from "@/lib/labels";
import { enumOptions } from "@/lib/options";
import { cn, formatDate } from "@/lib/utils";
import type { FileInfo } from "@/types/models";

interface PortalCreative {
  id: string;
  title: string;
  campaign: string | null;
  contentType: string;
  platform: string;
  status: string;
  publishDate: string | null;
  caption: string | null;
  createdAt: string;
  files: FileInfo[];
}

/** Client-facing gallery: only this client's approved and published creatives (enforced by the API). */
export function PortalGallery() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ month: "", campaign: "", platform: "", contentType: "" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PortalCreative | null>(null);
  const debounced = useDebounced(search);
  const creatives = useAsync(() => api.list<PortalCreative>("/portal/creatives", { ...filters, search: debounced, page, pageSize: 24 }), [filters, debounced, page]);
  const campaigns = useAsync(() => api.get<string[]>("/portal/creatives/campaigns"), []);
  const items = creatives.data?.items;

  function setFilter(key: keyof typeof filters, value: string) {
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
          placeholder="Search title, campaign, caption…"
        />
        <MonthPicker value={filters.month} onChange={(v) => setFilter("month", v)} />
        <FilterSelect label="Campaign" value={filters.campaign} onChange={(v) => setFilter("campaign", v)} options={(campaigns.data ?? []).map((c) => ({ value: c, label: c }))} />
        <FilterSelect label="Platform" value={filters.platform} onChange={(v) => setFilter("platform", v)} options={enumOptions(PLATFORMS)} />
        <FilterSelect label="Type" value={filters.contentType} onChange={(v) => setFilter("contentType", v)} options={enumOptions(CREATIVE_TYPES)} />
      </Toolbar>

      {creatives.error ? (
        <div className="p-4">
          <Alert>{creatives.error}</Alert>
        </div>
      ) : !items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon={Images} title="No creatives yet" description="Approved and published work will appear here for you to preview and download." />
      ) : (
        <div className={cn("grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6", creatives.loading && "opacity-60")}>
          {items.map((creative) => (
            <div key={creative.id} className="overflow-hidden rounded-lg border border-line">
              <button onClick={() => setSelected(creative)} className="block w-full text-left" aria-label={`Preview ${creative.title}`}>
                <CreativeThumb files={creative.files} className="aspect-square" />
              </button>
              <div className="space-y-1.5 p-2.5">
                <p className="truncate text-sm font-medium text-ink" title={creative.title}>
                  {creative.title}
                </p>
                <p className="truncate text-xs text-muted">{[creative.campaign, humanize(creative.platform)].filter(Boolean).join(" · ")}</p>
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={creative.status} />
                  <a href={api.url(`/portal/creatives/${creative.id}/download`)} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                    <Download className="size-3.5" /> {creative.files.length > 1 ? `All (${creative.files.length})` : "Download"}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination meta={creatives.data?.meta} onPage={setPage} />
      {selected && <PortalPreview creative={selected} onClose={() => setSelected(null)} />}
    </Card>
  );
}

function PortalPreview({ creative, onClose }: { creative: PortalCreative; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const file = creative.files[index];
  const many = creative.files.length > 1;

  return (
    <Modal
      open
      size="xl"
      title={creative.title}
      description={[creative.campaign, humanize(creative.contentType), humanize(creative.platform)].filter(Boolean).join(" · ")}
      onClose={onClose}
      footer={
        <a href={api.url(`/portal/creatives/${creative.id}/download`)}>
          <Button>
            <FolderDown className="size-4" /> {many ? `Download all ${creative.files.length} files (ZIP)` : "Download original (ZIP)"}
          </Button>
        </a>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-slate-900">
            {file && <MediaPreview key={file.id} file={file} controls className="max-h-full max-w-full object-contain" />}
            {many && (
              <>
                <button
                  onClick={() => setIndex((i) => (i - 1 + creative.files.length) % creative.files.length)}
                  className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow"
                  aria-label="Previous file"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button onClick={() => setIndex((i) => (i + 1) % creative.files.length)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow" aria-label="Next file">
                  <ChevronRight className="size-5" />
                </button>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                  {index + 1} / {creative.files.length}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <StatusBadge status={creative.status} />
            <span className="text-xs text-muted">{creative.publishDate ? `Publishes ${formatDate(creative.publishDate)}` : `Added ${formatDate(creative.createdAt)}`}</span>
          </div>
          {creative.caption && (
            <div>
              <p className="text-xs font-medium text-muted uppercase">Caption</p>
              <p className="mt-1 text-sm whitespace-pre-line">{creative.caption}</p>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-medium text-muted uppercase">Original files</p>
            <ul className="space-y-2">
              {creative.files.map((f, i) => (
                <li key={f.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", i === index ? "border-accent" : "border-line")}>
                  <button onClick={() => setIndex(i)} className="min-w-0 flex-1 truncate text-left" title={f.originalName}>
                    {f.originalName}
                  </button>
                  <span className="text-xs text-muted">{formatBytes(f.sizeBytes)}</span>
                  <a href={api.fileUrl(f.id, true)} className="rounded p-1 text-muted hover:bg-page hover:text-ink" title="Download this file" aria-label={`Download ${f.originalName}`}>
                    <Download className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
}
