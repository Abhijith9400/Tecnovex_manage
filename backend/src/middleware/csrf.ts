import { randomBytes, timingSafeEqual } from "node:crypto";
import type { CookieOptions, RequestHandler, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

/**
 * Double-submit CSRF protection for cookie-based auth.
 * GET /auth/csrf sets an httpOnly cookie and returns the same token in the body; the SPA sends it back in
 * the X-CSRF-Token header on every state-changing request. A cross-site page can neither read the body
 * (CORS) nor set the header, so forged requests fail.
 */
export const CSRF_COOKIE = "agency_csrf";
export const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function cookieOptions(maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction || env.COOKIE_SAMESITE === "none",
    sameSite: env.COOKIE_SAMESITE,
    path: "/",
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

export function issueCsrfToken(res: Response, existing?: string): string {
  const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, token, cookieOptions(24 * 60 * 60 * 1000));
  return token;
}

export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    throw new AppError(403, "Security token missing or invalid. Refresh the page and try again.", "CSRF_INVALID");
  }
  next();
};
