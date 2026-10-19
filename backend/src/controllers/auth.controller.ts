import type { Request, Response } from "express";
import { currentUser, SESSION_COOKIE } from "../middleware/auth";
import { cookieOptions, CSRF_COOKIE, issueCsrfToken } from "../middleware/csrf";
import * as authService from "../services/auth.service";
import { resendChallenge } from "../services/otp.service";
import { sendSuccess } from "../utils/apiResponse";

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function csrf(req: Request, res: Response) {
  sendSuccess(res, { csrfToken: issueCsrfToken(res, req.cookies?.[CSRF_COOKIE]) });
}

function startSession(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE_MS));
  // Rotate the CSRF token on login.
  return issueCsrfToken(res);
}

/** Step 1. Returns { otpRequired: true, challengeId, emailHint } when an emailed code is needed. */
export async function login(req: Request, res: Response) {
  const result = await authService.login(req, req.body.email, req.body.password);
  if (result.otpRequired) {
    const { otpRequired, challengeId, emailHint, expiresInMinutes, resendInSeconds } = result;
    return sendSuccess(res, { otpRequired, challengeId, emailHint, expiresInMinutes, resendInSeconds });
  }
  sendSuccess(res, { otpRequired: false, user: result.user, csrfToken: startSession(res, result.token) });
}

/** Step 2: verify the emailed code and start the session. */
export async function verifyOtp(req: Request, res: Response) {
  const { token, user } = await authService.verifyOtp(req, req.body.challengeId, req.body.code);
  sendSuccess(res, { user, csrfToken: startSession(res, token) });
}

export async function resendOtp(req: Request, res: Response) {
  sendSuccess(res, await resendChallenge(req, req.body.challengeId));
}

export async function forgotPassword(req: Request, res: Response) {
  sendSuccess(res, await authService.forgotPassword(req, req.body.email));
}

export async function resendResetCode(req: Request, res: Response) {
  sendSuccess(res, await authService.resendResetCode(req, req.body.resetId));
}

export async function resetPassword(req: Request, res: Response) {
  sendSuccess(res, await authService.resetPassword(req, req.body.resetId, req.body.code, req.body.newPassword));
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  sendSuccess(res, { loggedOut: true });
}

export async function logoutAll(req: Request, res: Response) {
  await authService.logoutEverywhere(currentUser(req).id);
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  sendSuccess(res, { loggedOut: true });
}

export function me(req: Request, res: Response) {
  sendSuccess(res, currentUser(req));
}

export async function changePassword(req: Request, res: Response) {
  const token = await authService.changePassword(req, currentUser(req).id, req.body.currentPassword, req.body.newPassword);
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE_MS));
  sendSuccess(res, { changed: true });
}

export async function listUsers(_req: Request, res: Response) {
  sendSuccess(res, await authService.listUsers());
}

export async function createUser(req: Request, res: Response) {
  sendSuccess(res, await authService.createUser(req, req.body), 201);
}

export async function updateUser(req: Request, res: Response) {
  sendSuccess(res, await authService.updateUser(req, String(req.params.id), req.body));
}
