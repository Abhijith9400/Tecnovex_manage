import { z } from "zod";
import { PaymentMethod, PaymentStatus } from "../generated/prisma/enums";
import { dateOnly, dateRangeQuery, listQuery, optionalText, positiveMoney } from "./common";

/** Arrives as multipart (optional proof file), so every field is a string. */
export const paymentSchema = z.object({
  invoiceId: z
    .union([z.uuid(), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  clientId: z
    .union([z.uuid(), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  paymentDate: dateOnly,
  amount: positiveMoney,
  method: z.enum(PaymentMethod),
  reference: optionalText(100),
  notes: optionalText(2000),
  /** Random key generated per form submission by the client to make retries/double-clicks safe. */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

export const paymentListQuery = listQuery.extend(dateRangeQuery.shape).extend({
  clientId: z.uuid().optional(),
  invoiceId: z.uuid().optional(),
  method: z.enum(PaymentMethod).optional(),
  status: z.enum(PaymentStatus).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
