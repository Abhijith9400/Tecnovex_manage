import { z } from "zod";
import { PaymentMethod } from "../generated/prisma/enums";

/** Money as a string or number with at most 2 decimals; kept as a string so it maps exactly to Decimal. */
export const money = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,12}(\.\d{1,2})?$/.test(value), "Enter a valid amount with up to 2 decimals");

export const positiveMoney = money.refine((value) => Number(value) > 0, "Amount must be greater than zero");

/** Signed amount (for adjustments). */
export const signedMoney = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^-?\d{1,12}(\.\d{1,2})?$/.test(value) && Number(value) !== 0, "Enter a non-zero amount with up to 2 decimals");

export const percent = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,3}(\.\d{1,2})?$/.test(value) && Number(value) <= 100, "Enter a percentage between 0 and 100");

export const quantity = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,8}(\.\d{1,2})?$/.test(value) && Number(value) > 0, "Quantity must be greater than zero");

/** YYYY-MM-DD → Date at UTC midnight. */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => !Number.isNaN(date.getTime()), "Invalid date");

export const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the format YYYY-MM");

/** Optional text: trims, turns "" into null. */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const requiredText = (max = 200) => z.string().trim().min(1, "Required").max(max);

export const optionalDate = z
  .union([dateOnly, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

export const optionalMoney = z
  .union([money, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

export const optionalInt = z
  .union([z.coerce.number().int().min(0).max(100000), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value === "" || value === undefined ? null : value));

export const paymentMethod = z.enum(PaymentMethod);

export const uuid = z.uuid();
export const idParams = z.object({ id: uuid });

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export const dateRangeQuery = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

/** Booleans that arrive as strings in multipart forms and query strings. */
export const booleanish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
  .transform((value) => value === true || value === "true" || value === "1" || value === "on");
