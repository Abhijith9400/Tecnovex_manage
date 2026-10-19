"use client";

import { api } from "./api";
import { useAsync } from "./hooks";
import { humanize } from "./labels";
import type { Category, ClientOption } from "@/types/models";

export function useClientOptions(includeArchived = false) {
  return useAsync(() => api.get<ClientOption[]>("/clients/options", { includeArchived }), [includeArchived]);
}

export function useCategories(type: Category["type"]) {
  return useAsync(() => api.get<Category[]>("/settings/categories", { type }), [type]);
}

/** Builds <select> options from enum values. */
export function enumOptions(values: readonly string[]) {
  return values.map((value) => ({ value, label: humanize(value) }));
}

/** A random key per form submission so retries and double-clicks never create duplicate records. */
export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Triggers a browser download of an authenticated API file (CSV/PDF) using the session cookie. */
export function downloadUrl(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
