import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import type { Role } from "../generated/prisma/enums";
import { AppError } from "../utils/AppError";

export const SESSION_COOKIE = "agency_session";

interface SessionPayload {
  sub: string;
  ver: number;
}

export function signSession(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, ver: tokenVersion } satisfies SessionPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    algorithm: "HS256",
  });
}

/** Verifies the session cookie and reloads the user so deactivation and password changes take effect immediately. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw AppError.unauthorized();

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as unknown as SessionPayload;
  } catch {
    throw AppError.unauthorized("Your session has expired. Please sign in again.");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, employeeId: true, clientId: true, isActive: true, tokenVersion: true },
  });
  if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
    throw AppError.unauthorized("Your session is no longer valid. Please sign in again.");
  }

  req.user = { id: user.id, email: user.email, name: user.name, role: user.role, employeeId: user.employeeId, clientId: user.clientId };
  next();
};

export function authorize(roles: readonly Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw AppError.unauthorized();
    if (!roles.includes(req.user.role)) throw AppError.forbidden();
    next();
  };
}

/** For handlers that always run after authenticate. */
export function currentUser(req: Express.Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
