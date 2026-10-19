/**
 * Emailed one-time codes, used for (1) the second step of sign-in and (2) "forgot password".
 * Codes are stored as an HMAC, expire after 10 minutes, allow 5 attempts and work only for their own purpose.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import type { ChallengePurpose } from "../generated/prisma/enums";
import { AppError } from "../utils/AppError";
import { audit } from "./audit.service";
import { otpEmail, sendMail } from "./mail.service";

export const OTP_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_SENDS = 5;

/** LOGIN_OTP_ENABLED=false in .env is a master off switch (read at call time so tests can flip it). */
export function otpAllowedByServer() {
  return (process.env.LOGIN_OTP_ENABLED ?? env.LOGIN_OTP_ENABLED) !== "false";
}

/** Sign-in needs an emailed code when the server allows it and the admin has it switched on in Settings. */
export async function otpEnabled() {
  if (!otpAllowedByServer()) return false;
  const settings = await prisma.companySettings.findUnique({ where: { id: 1 }, select: { loginOtpEnabled: true } });
  return settings?.loginOtpEnabled ?? true;
}

function hashCode(challengeId: string, code: string) {
  return createHmac("sha256", env.JWT_SECRET).update(`${challengeId}:${code}`).digest("hex");
}

function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** "abhijith@tecnovexdigital.com" → "ab••••••@tecnovexdigital.com" */
export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

/** Audit as the user the code belongs to (keeps req.ip for the log). */
function asUser(req: Request, userId: string) {
  return Object.assign(Object.create(req), { user: { id: userId } }) as Request;
}

async function emailCode(req: Request, user: { email: string; name: string }, code: string, purpose: ChallengePurpose) {
  const settings = await prisma.companySettings.findUnique({ where: { id: 1 }, select: { legalName: true, tradingName: true } });
  const companyName = settings?.tradingName || settings?.legalName || "Tecnovex Digital";
  await sendMail({ to: user.email, ...otpEmail({ name: user.name, code, minutes: OTP_MINUTES, companyName, ip: req.ip ?? null, purpose }) });
}

/** Creates a challenge for the user and emails the code. Any earlier open challenge for the same purpose is closed. */
export async function startChallenge(req: Request, user: { id: string; email: string; name: string }, purpose: ChallengePurpose = "LOGIN") {
  await prisma.loginChallenge.updateMany({ where: { userId: user.id, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
  const challenge = await prisma.loginChallenge.create({
    data: { userId: user.id, purpose, codeHash: "pending", expiresAt: new Date(Date.now() + OTP_MINUTES * 60_000), ipAddress: req.ip ?? null },
  });
  const code = newCode();
  await prisma.loginChallenge.update({ where: { id: challenge.id }, data: { codeHash: hashCode(challenge.id, code) } });
  try {
    await emailCode(req, user, code, purpose);
  } catch (error) {
    await prisma.loginChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    throw error;
  }
  await audit(asUser(req, user.id), {
    action: purpose === "LOGIN" ? "OTP_SENT" : "PASSWORD_RESET_REQUESTED",
    entityType: "User",
    entityId: user.id,
    summary: `${purpose === "LOGIN" ? "Sign-in" : "Password reset"} code emailed to ${maskEmail(user.email)}`,
  });
  return { challengeId: challenge.id, emailHint: maskEmail(user.email), expiresInMinutes: OTP_MINUTES, resendInSeconds: OTP_RESEND_SECONDS };
}

const AGAIN: Record<ChallengePurpose, string> = { LOGIN: "Please sign in again.", PASSWORD_RESET: "Please request a new reset code." };

async function openChallenge(challengeId: string, purpose: ChallengePurpose) {
  const challenge = await prisma.loginChallenge.findUnique({ where: { id: challengeId }, include: { user: true } });
  // Wrong purpose looks exactly like an unknown code.
  if (!challenge || challenge.purpose !== purpose || challenge.consumedAt) throw AppError.badRequest(`This code is no longer valid. ${AGAIN[purpose]}`);
  if (challenge.expiresAt < new Date()) throw AppError.badRequest(`This code has expired. Request a new code. `.trim());
  if (!challenge.user.isActive) throw AppError.unauthorized("Your account is disabled");
  return challenge;
}

/** Verifies and consumes the code. Returns the user, or throws with how many attempts remain. */
export async function verifyChallenge(req: Request, challengeId: string, code: string, purpose: ChallengePurpose = "LOGIN") {
  const challenge = await openChallenge(challengeId, purpose);
  const expected = Buffer.from(challenge.codeHash, "hex");
  const given = Buffer.from(hashCode(challengeId, code.trim()), "hex");
  const ok = expected.length === given.length && timingSafeEqual(expected, given);

  if (!ok) {
    const attempts = challenge.attempts + 1;
    const exhausted = attempts >= OTP_MAX_ATTEMPTS;
    await prisma.loginChallenge.update({ where: { id: challengeId }, data: { attempts, ...(exhausted ? { consumedAt: new Date() } : {}) } });
    await audit(asUser(req, challenge.userId), {
      action: "OTP_FAILED",
      entityType: "User",
      entityId: challenge.userId,
      summary: exhausted
        ? `${purpose === "LOGIN" ? "Sign-in" : "Password reset"} code entered wrongly too many times; cancelled`
        : `Wrong ${purpose === "LOGIN" ? "sign-in" : "password reset"} code (attempt ${attempts} of ${OTP_MAX_ATTEMPTS})`,
    });
    throw exhausted
      ? AppError.badRequest(`Too many wrong codes. ${AGAIN[purpose]}`)
      : new AppError(400, `That code isn't right. ${OTP_MAX_ATTEMPTS - attempts} attempt${OTP_MAX_ATTEMPTS - attempts === 1 ? "" : "s"} left.`, "OTP_INVALID");
  }

  // Single use: consume atomically so the same code can't be replayed.
  const consumed = await prisma.loginChallenge.updateMany({ where: { id: challengeId, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count === 0) throw AppError.badRequest(`This code has already been used. ${AGAIN[purpose]}`);
  return challenge.user;
}

export async function resendChallenge(req: Request, challengeId: string, purpose: ChallengePurpose = "LOGIN") {
  const challenge = await openChallenge(challengeId, purpose);
  const wait = OTP_RESEND_SECONDS - Math.floor((Date.now() - challenge.lastSentAt.getTime()) / 1000);
  if (wait > 0) throw new AppError(429, `Please wait ${wait} seconds before requesting another code.`, "OTP_RESEND_TOO_SOON");
  if (challenge.sendCount >= OTP_MAX_SENDS) throw new AppError(429, `Too many codes requested. ${AGAIN[purpose]}`, "OTP_RESEND_LIMIT");

  const code = newCode();
  await prisma.loginChallenge.update({
    where: { id: challengeId },
    // A new code replaces the old one and restarts the expiry and attempt count.
    data: { codeHash: hashCode(challengeId, code), sendCount: { increment: 1 }, lastSentAt: new Date(), attempts: 0, expiresAt: new Date(Date.now() + OTP_MINUTES * 60_000) },
  });
  await emailCode(req, challenge.user, code, purpose);
  await audit(asUser(req, challenge.userId), {
    action: purpose === "LOGIN" ? "OTP_SENT" : "PASSWORD_RESET_REQUESTED",
    entityType: "User",
    entityId: challenge.userId,
    summary: `${purpose === "LOGIN" ? "Sign-in" : "Password reset"} code re-sent to ${maskEmail(challenge.user.email)}`,
  });
  return { emailHint: maskEmail(challenge.user.email), expiresInMinutes: OTP_MINUTES, resendInSeconds: OTP_RESEND_SECONDS };
}
