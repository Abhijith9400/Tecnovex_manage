"use client";

import { Check, ImageOff } from "@/components/ui/icons";
import { useState } from "react";
import { Alert } from "@/components/ui/Feedback";
import { CreativeThumb } from "@/features/creatives/CreativeThumb";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";
import type { CreativeOption } from "@/types/models";

/** Visual picker for the poster / reel / carousel that a campaign boosted. */
export function CreativePicker({
  clientId,
  value,
  onChange,
  error,
  disabled,
  preferType,
}: {
  clientId: string;
  value: string;
  onChange: (id: string) => void;
  error?: string;
  disabled?: boolean;
  /** Reel boosts list reels/videos first, post boosts list posters/carousels first. */
  preferType?: "REEL" | "POST" | null;
}) {
  const [search, setSearch] = useState("");
  const options = useAsync(() => (clientId ? api.get<CreativeOption[]>("/ad-campaigns/creative-options", { clientId }) : Promise.resolve([] as CreativeOption[])), [clientId]);

  if (!clientId) return <p className="text-sm text-muted">Choose the client first.</p>;
  if (options.error) return <Alert>{options.error}</Alert>;

  const isVideo = (o: CreativeOption) => ["REEL", "VIDEO"].includes(o.contentType);
  const filtered = (options.data ?? [])
    .filter((o) => !search || `${o.title} ${o.campaign ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (preferType ? Number((preferType === "REEL") !== isVideo(a)) - Number((preferType === "REEL") !== isVideo(b)) : 0));

  return (
    <div className={cn("rounded-lg border p-3", error ? "border-danger" : "border-line")}>
      <div className="mb-2 flex items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search this client's creatives…"
          aria-label="Search creatives"
          disabled={disabled}
          className="h-9 w-full rounded-lg border border-line px-3 text-sm focus:border-accent focus:outline-none"
        />
        {value && !disabled && (
          <button type="button" onClick={() => onChange("")} className="shrink-0 text-xs font-medium text-muted hover:text-ink">
            Clear
          </button>
        )}
      </div>
      {options.loading && !options.data ? (
        <p className="py-6 text-center text-sm text-muted">Loading creatives…</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted">
          <ImageOff className="size-5" />
          No creatives found for this client. Paste the post link below instead.
        </div>
      ) : (
        <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
          {filtered.map((o) => {
            const selected = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange(selected ? "" : o.id)}
                aria-pressed={selected}
                title={o.title}
                className={cn("relative overflow-hidden rounded-lg border-2 text-left transition-colors", selected ? "border-accent" : "border-transparent hover:border-orange-200")}
              >
                <CreativeThumb files={o.files} className="aspect-square" />
                {selected && (
                  <span className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="size-3.5" />
                  </span>
                )}
                <span className="block bg-card px-1.5 py-1">
                  <span className="block truncate text-xs font-medium text-ink">{o.title}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {humanize(o.contentType)} · {formatDate(o.createdAt)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
