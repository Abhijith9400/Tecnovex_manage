import { z } from "zod";
import { Role } from "../generated/prisma/enums";
import { optionalText, requiredText } from "./common";

export const passwordRule = z.string().min(12, "Use at least 12 characters").max(200);

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1, "Required").max(200),
});

export const verifyOtpSchema = z.object({
  challengeId: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
});

export const resendOtpSchema = z.object({ challengeId: z.uuid() });

export const forgotPasswordSchema = z.object({ email: z.email().trim().toLowerCase() });

export const resendResetSchema = z.object({ resetId: z.uuid() });

export const resetPasswordSchema = z.object({
  resetId: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
  newPassword: passwordRule,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordRule,
});

export const createUserSchema = z.object({
  name: requiredText(120),
  email: z.email().trim().toLowerCase(),
  role: z.enum(Role),
  password: passwordRule,
  employeeId: optionalText(64),
  clientId: optionalText(64),
});

export const updateUserSchema = z.object({
  name: requiredText(120).optional(),
  role: z.enum(Role).optional(),
  isActive: z.boolean().optional(),
  // .optional() outside the transform keeps an omitted field undefined (unchanged) rather than null (cleared).
  employeeId: optionalText(64).optional(),
  clientId: optionalText(64).optional(),
  /** Optional admin reset. Forces all sessions of that user to end. */
  password: passwordRule.optional(),
});
