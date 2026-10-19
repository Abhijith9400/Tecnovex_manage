import { z } from "zod";
import { InvoiceStatus } from "../generated/prisma/enums";
import { dateOnly, dateRangeQuery, listQuery, money, optionalDate, optionalText, percent, period, quantity, requiredText } from "./common";

export const invoiceItemSchema = z.object({
  serviceId: z
    .union([z.uuid(), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  description: requiredText(500),
  sacCode: optionalText(20),
  quantity,
  unitPrice: money,
  discount: money.default("0"),
  taxRate: percent.default("0"),
});

/** Totals are never accepted from the client; they are recalculated from items on the server. */
export const invoiceSchema = z.object({
  clientId: z.uuid(),
  billingPeriod: z
    .union([period, z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  issueDate: dateOnly,
  dueDate: optionalDate,
  templateId: z
    .union([z.uuid(), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  notes: optionalText(2000),
  terms: optionalText(4000),
  items: z.array(invoiceItemSchema).min(1, "Add at least one line item").max(100),
  /** Must be true to knowingly create a second invoice for the same client and billing month. */
  allowDuplicate: z.boolean().default(false),
});

export const generateSchema = z.object({
  clientId: z.uuid(),
  billingPeriod: period,
  issueDate: optionalDate,
  allowDuplicate: z.boolean().default(false),
});

export const generateMonthlySchema = z.object({
  billingPeriod: period,
  issueDate: optionalDate,
});

export const issuedUpdateSchema = z.object({
  dueDate: dateOnly,
  notes: optionalText(2000),
  terms: optionalText(4000),
});

export const reasonSchema = z.object({ reason: requiredText(500) });

export const invoiceListQuery = listQuery.extend(dateRangeQuery.shape).extend({
  status: z.enum(InvoiceStatus).optional(),
  clientId: z.uuid().optional(),
  billingPeriod: period.optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
