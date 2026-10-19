"use client";

import { Download, Eye, FileText, Film, ImageIcon } from "@/components/ui/icons";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { formatBytes, humanize, statusTone } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { FileInfo } from "@/types/models";
import { Badge } from "./Feedback";

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? "neutral"}>{humanize(status)}</Badge>;
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { value: T; label: string }[]; active: T; onChange: (value: T) => void }) {
  return (
    <div className="mb-4 overflow-x-auto border-b border-line" role="tablist">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active === tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active === tab.value ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="size-4 shrink-0 text-muted" aria-hidden />;
  if (mimeType.startsWith("video/")) return <Film className="size-4 shrink-0 text-muted" aria-hidden />;
  return <FileText className="size-4 shrink-0 text-muted" aria-hidden />;
}

/** A stored file with View (inline) and Download links. Access is enforced by the API. */
export function FileLink({ file, actions }: { file: FileInfo; actions?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
      <FileIcon mimeType={file.mimeType} />
      <span className="min-w-0 flex-1 truncate" title={file.originalName}>
        {file.originalName}
      </span>
      <span className="text-xs text-muted">{formatBytes(file.sizeBytes)}</span>
      <a href={api.fileUrl(file.id)} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-muted hover:bg-page hover:text-ink" title="View">
        <Eye className="size-4" />
      </a>
      <a href={api.fileUrl(file.id, true)} className="rounded p-1 text-muted hover:bg-page hover:text-ink" title="Download">
        <Download className="size-4" />
      </a>
      {actions}
    </div>
  );
}

export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium text-muted">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words whitespace-pre-line text-ink">{item.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
