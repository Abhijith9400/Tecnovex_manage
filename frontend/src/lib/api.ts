import type { ApiResponse, Paginated, PaginationMeta } from "@/types/api";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

interface RequestOptions {
  method?: string;
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// CSRF token held in memory only. The matching httpOnly cookie is set by the API.
let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

async function ensureCsrfToken(force = false): Promise<string> {
  if (csrfToken && !force) return csrfToken;
  csrfPromise ??= fetch(`${API_URL}/auth/csrf`, { credentials: "include" })
    .then((r) => r.json() as Promise<ApiResponse<{ csrfToken: string }>>)
    .then((payload) => {
      if (!payload.success) throw new ApiError(500, "Could not obtain a security token");
      csrfToken = payload.data.csrfToken;
      return csrfToken;
    })
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

/** For requests made outside this client (e.g. XHR uploads with progress). */
export function getCsrfToken(): Promise<string> {
  return ensureCsrfToken();
}

/** API_URL may be absolute (local dev) or relative like "/api/v1" (hosted, proxied through the frontend's own domain). */
const RELATIVE_API = !/^https?:\/\//.test(API_URL);

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${API_URL}${path}`, "http://relative.invalid");
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  // Relative stays relative, so server and browser render the same links.
  return RELATIVE_API ? `${url.pathname}${url.search}` : url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}, retried = false): Promise<{ data: T; meta?: PaginationMeta }> {
  const method = options.method ?? "GET";
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (options.body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (!SAFE_METHODS.has(method)) {
    try {
      headers["X-CSRF-Token"] = await ensureCsrfToken();
    } catch {
      throw new ApiError(0, "Cannot reach the server. Check that the backend is running.", "NETWORK_ERROR");
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      credentials: "include",
      headers,
      body: options.body === undefined ? undefined : isFormData ? (options.body as FormData) : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check that the backend is running.", "NETWORK_ERROR");
  }

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload || !payload.success) {
    const error = payload && !payload.success ? payload.error : undefined;
    if (error?.code === "CSRF_INVALID" && !retried) {
      await ensureCsrfToken(true);
      return request<T>(path, options, true);
    }
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
    throw new ApiError(response.status, error?.message ?? `Request failed (${response.status})`, error?.code, error?.details);
  }

  return { data: payload.data, meta: payload.meta };
}

/** Single shared API client. Every request sends the httpOnly session cookie; writes also send the CSRF token. */
export const api = {
  get: async <T>(path: string, query?: Query) => (await request<T>(path, { query })).data,
  list: async <T>(path: string, query?: Query): Promise<Paginated<T>> => {
    const { data, meta } = await request<T[]>(path, { query });
    return { items: data, meta: meta ?? { page: 1, pageSize: data.length, total: data.length, totalPages: 1 } };
  },
  post: async <T>(path: string, body?: unknown, headers?: Record<string, string>) => (await request<T>(path, { method: "POST", body, headers })).data,
  put: async <T>(path: string, body?: unknown) => (await request<T>(path, { method: "PUT", body })).data,
  patch: async <T>(path: string, body?: unknown) => (await request<T>(path, { method: "PATCH", body })).data,
  delete: async <T>(path: string) => (await request<T>(path, { method: "DELETE" })).data,
  /** Absolute URL for links that open or download files (cookies are sent automatically). */
  url: (path: string, query?: Query) => buildUrl(path, query),
  fileUrl: (fileId: string, download = false) => buildUrl(`/files/${fileId}${download ? "/download" : ""}`),
};

/** Maps a validation error's issues to { fieldName: message } for inline form errors. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};
  const result: Record<string, string> = {};
  for (const issue of error.details as { path?: (string | number)[]; message?: string }[]) {
    const key = issue.path?.join(".");
    if (key && !result[key]) result[key] = issue.message ?? "Invalid value";
  }
  return result;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

/** Returned (HTTP 202) when an action needs sign-off instead of happening now. */
export interface ApprovalRequested {
  approvalRequested: true;
  request: { id: string; title: string; kind: string; status: string };
}

export function isApprovalRequested(value: unknown): value is ApprovalRequested {
  return typeof value === "object" && value !== null && (value as { approvalRequested?: unknown }).approvalRequested === true;
}

/** Toast text for an action that was sent for approval. */
export function approvalMessage(result: ApprovalRequested) {
  return result.request.kind === "DELETE" ? "Delete request sent to a manager for approval" : "Sent to the administrator for approval";
}
