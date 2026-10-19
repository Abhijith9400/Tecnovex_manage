"use client";

import { ChevronLeft, ChevronRight, Search } from "@/components/ui/icons";
import type { ReactNode } from "react";
import type { PaginationMeta } from "@/types/api";
import { cn } from "@/lib/utils";
import { Alert, EmptyState, Spinner } from "./Feedback";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  error,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  error?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (error) {
    return (
      <div className="p-4">
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!rows) return <Spinner />;
  if (rows.length === 0) {
    return loading ? <Spinner /> : <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className={cn("overflow-x-auto", loading && "opacity-60")}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-page/60 text-left text-xs font-medium tracking-wide text-muted uppercase">
            {columns.map((column) => (
              <th key={column.header} scope="col" className={cn("px-4 py-2.5 whitespace-nowrap", column.align === "right" && "text-right", column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn("bg-card", onRowClick && "cursor-pointer hover:bg-page")}
            >
              {columns.map((column) => (
                <td key={column.header} className={cn("px-4 py-3 align-middle", column.align === "right" && "text-right tabular-nums", column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, onPage }: { meta?: PaginationMeta; onPage: (page: number) => void }) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
      <span>
        {from}–{to} of {meta.total}
      </span>
      <div className="flex gap-1">
        <button
          className="rounded-md border border-line p-1.5 hover:bg-page disabled:opacity-40"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          className="rounded-md border border-line p-1.5 hover:bg-page disabled:opacity-40"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-line bg-card pr-3 pl-9 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
      />
    </div>
  );
}

/** Row of filters shown above a table. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

export function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className="h-9 rounded-lg border border-line bg-card px-2.5 text-sm focus:border-accent focus:outline-none"
    >
      <option value="">{label}: All</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
