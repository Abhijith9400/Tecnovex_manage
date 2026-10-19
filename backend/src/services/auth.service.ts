import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { Request } from "express";
import { prisma } from "../db/prisma";
import type { Role } from "../generated/prisma/enums";
import { signSession } from "../middleware/auth";
import { AppError } from "../utils/AppError";
import { audit } from "./audit.service";
import { maskEmail, OTP_MINUTES, OTP_RESEND_SECONDS, otpEnabled, resendChallenge, startChallenge, verifyChallenge } from "./otp.service";

// Verified against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH_PROMISE = argon2.hash("not-a-real-password-placeholder", { type: argon2.argon2id });

export function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

const userSelect = { id: true, email: true, name: true, role: true, employeeId: true, clientId: true, isActive: true, lastLoginAt: true, createdAt: true } as const;

type LoginUser = { id: string; email: string; name: string; role: Role; employeeId: string | null; clientId: string | null; tokenVersion: number };

/** Issues the session after all checks (password, and OTP when enabled) have passed. */
export async function completeLogin(req: Request, user: LoginUser, method: string) {
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const authUser = { id: user.id, email: user.email, name: user.name, role: user.role, employeeId: user.employeeId, clientId: user.clientId };
  req.user = authUser;
  await audit(req, { action: "LOGIN", entityType: "User", entityId: user.id, summary: `${user.email} signed in (${method})` });
  return { token: signSession(user.id, user.tokenVersion), user: authUser };
}

/**
 * Step 1: email + password. With email OTP enabled no session is issued yet; a code is emailed and the
 * client must call verifyOtp. Otherwise the session is issued immediately.
 */
export async function login(req: Request, email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await argon2.verify(user.passwordHash, password) : (await argon2.verify(await DUMMY_HASH_PROMISE, password), false);

  if (!user || !valid || !user.isActive) {
    throw AppError.unauthorized("Invalid email or password");
  }

  if (await otpEnabled()) {
    return { otpRequired: true as const, ...(await startChallenge(req, user)) };
  }
  return { otpRequired: false as const, ...(await completeLogin(req, user, "password")) };
}

// ---------------------------------------------------------------------------
// Forgot password (email code)
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts a password reset. The response is identical whether or not the email belongs to an active account
 * (a random id is returned for unknown emails), so the form can't be used to discover who has an account.
 */
export async function forgotPassword(req: Request, email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    // Similar response time to a real send.
    await sleep(400 + Math.floor(Math.random() * 400));
    return { resetId: randomUUID(), emailHint: maskEmail(email), expiresInMinutes: OTP_MINUTES, resendInSeconds: OTP_RESEND_SECONDS };
  }
  const { challengeId, ...rest } = await startChallenge(req, user, "PASSWORD_RESET");
  return { resetId: challengeId, ...rest };
}

export async function resendResetCode(req: Request, resetId: string) {
  const exists = await prisma.loginChallenge.findUnique({ where: { id: resetId }, select: { id: true } });
  // Unknown id (e.g. an email with no account): same answer as a real resend.
  if (!exists) return { emailHint: "your email", expiresInMinutes: OTP_MINUTES, resendInSeconds: OTP_RESEND_SECONDS };
  return resendChallenge(req, resetId, "PASSWORD_RESET");
}

/** Verifies the code, sets the new password and signs the account out everywhere. */
export async function resetPassword(req: Request, resetId: string, code: string, newPassword: string) {
  const exists = await prisma.loginChallenge.findUnique({ where: { id: resetId }, select: { id: true } });
  if (!exists) throw new AppError(400, "That code isn't right. Request a new reset code.", "OTP_INVALID");
  const user = await verifyChallenge(req, resetId, code, "PASSWORD_RESET");
  if (await argon2.verify(user.passwordHash, newPassword)) throw AppError.badRequest("Choose a password different from your current one");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } } });
    // Any half-finished sign-in started with the old password is cancelled too.
    await tx.loginChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role, employeeId: user.employeeId, clientId: user.clientId };
    await audit(req, { action: "PASSWORD_RESET", entityType: "User", entityId: user.id, summary: `Password reset by email code for ${maskEmail(user.email)}; all sessions signed out` }, tx);
  });
  return { reset: true };
}

/** Step 2: the emailed code. */
export async function verifyOtp(req: Request, challengeId: string, code: string) {
  const user = await verifyChallenge(req, challengeId, code);
  return completeLogin(req, user, "password + email code");
}

export async function changePassword(req: Request, userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await argon2.verify(user.passwordHash, currentPassword))) {
    throw AppError.badRequest("Current password is incorrect");
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
  });
  await audit(req, { action: "PASSWORD_CHANGE", entityType: "User", entityId: userId, summary: "Password changed" });
  return signSession(updated.id, updated.tokenVersion);
}

export async function logoutEverywhere(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}

// --- user administration (ADMIN) ---

export function listUsers() {
  return prisma.user.findMany({
    select: { ...userSelect, employee: { select: { id: true, fullName: true, employeeCode: true } }, client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * EMPLOYEE logins must point at an employee record and CLIENT logins at a client. Links that do not apply to
 * the role are cleared, so a staff account can never inherit a client's portal scope.
 */
async function resolveLinks(role: Role, employeeId: string | null, clientId: string | null) {
  const links = { employeeId: role === "CLIENT" ? null : employeeId, clientId: role === "CLIENT" ? clientId : null };
  if (role === "EMPLOYEE" && !links.employeeId) throw AppError.badRequest("Employee logins must be linked to an employee record");
  if (role === "CLIENT" && !links.clientId) throw AppError.badRequest("Client portal logins must be linked to a client");
  if (links.employeeId && !(await prisma.employee.findUnique({ where: { id: links.employeeId } }))) throw AppError.badRequest("Employee not found");
  if (links.clientId) {
    const client = await prisma.client.findUnique({ where: { id: links.clientId } });
    if (!client) throw AppError.badRequest("Client not found");
    if (client.archivedAt) throw AppError.badRequest("Restore the archived client before giving it portal access");
  }
  return links;
}

/** Managers manage logins too, but cannot create administrators (that would bypass admin approvals). */
function assertCanGrantRole(req: Request, role: Role) {
  if (role === "ADMIN" && req.user?.role !== "ADMIN") throw AppError.forbidden("Only an administrator can give the administrator role");
}

export async function createUser(
  req: Request,
  input: { name: string; email: string; role: Role; password: string; employeeId: string | null; clientId: string | null },
) {
  assertCanGrantRole(req, input.role);
  const links = await resolveLinks(input.role, input.employeeId, input.clientId);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw AppError.conflict("A user with this email already exists");
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, role: input.role, ...links, passwordHash: await hashPassword(input.password) },
    select: userSelect,
  });
  await audit(req, { action: "CREATE", entityType: "User", entityId: user.id, summary: `User ${user.email} created with role ${user.role}` });
  return user;
}

export async function updateUser(
  req: Request,
  id: string,
  input: { name?: string; role?: Role; isActive?: boolean; employeeId?: string | null; clientId?: string | null; password?: string },
) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("User");
  if (id === req.user?.id && (input.isActive === false || (input.role && input.role !== existing.role))) {
    throw AppError.badRequest("You cannot deactivate your own account or change your own role");
  }
  if (req.user?.role !== "ADMIN" && existing.role === "ADMIN") throw AppError.forbidden("Only an administrator can change an administrator's login");
  if (input.role) assertCanGrantRole(req, input.role);
  const role = input.role ?? existing.role;
  const links = await resolveLinks(
    role,
    input.employeeId === undefined ? existing.employeeId : input.employeeId,
    input.clientId === undefined ? existing.clientId : input.clientId,
  );

  const revokeSessions =
    input.password !== undefined || input.isActive === false || (input.role !== undefined && input.role !== existing.role) || links.clientId !== existing.clientId;
  const user = await prisma.user.update({
    where: { id },
    data: {
      name: input.name,
      role: input.role,
      isActive: input.isActive,
      ...links,
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      ...(revokeSessions ? { tokenVersion: { increment: 1 } } : {}),
    },
    select: userSelect,
  });
  await audit(req, {
    action: "UPDATE",
    entityType: "User",
    entityId: id,
    summary: `User ${user.email} updated${input.password ? " (password reset)" : ""}`,
    changes: { role: user.role, isActive: user.isActive },
  });
  return user;
}
