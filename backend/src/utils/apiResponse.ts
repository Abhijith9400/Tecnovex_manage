import type { Response } from "express";

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Every successful response has the shape `{ success: true, data, meta? }`.
 * Errors are shaped by the error handler as `{ success: false, error: { code, message, details? } }`.
 */
export function sendSuccess<T>(res: Response, data: T, status = 200, meta?: PaginationMeta) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function paginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
