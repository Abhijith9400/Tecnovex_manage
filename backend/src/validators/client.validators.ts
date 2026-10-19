import { z } from "zod";
import { BillingCycle, BillingType, ClientStatus } from "../generated/prisma/enums";
import { booleanish, listQuery, money, optionalMoney, optionalText, percent, quantity, requiredText } from "./common";

const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const clientSchema = z.object({
  name: requiredText(200),
  contactPerson: optionalText(120),
  email: z.union([z.email(), z.literal(""), z.null()]).optional().transform((v) => v || null),
  phone: optionalText(40),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: z.string().trim().min(1).max(100).default("India"),
  pan: optionalText(10).transform((v) => v?.toUpperCase() ?? null).refine((v) => !v || panPattern.test(v), "PAN format looks invalid (e.g. ABCDE1234F)"),
  gstin: optionalText(15).transform((v) => v?.toUpperCase() ?? null).refine((v) => !v || gstinPattern.test(v), "GSTIN format looks invalid"),
  billingType: z.enum(BillingType),
  monthlyRetainer: optionalMoney,
  projectPrice: optionalMoney,
  billingCycle: z.enum(BillingCycle),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  status: z.enum(ClientStatus),
  notes: optionalText(5000),
});

export const clientListQuery = listQuery.extend({
  status: z.enum(ClientStatus).optional(),
  archived: booleanish.optional(),
});

export const serviceSchema = z.object({
  name: requiredText(200),
  description: optionalText(1000),
  sacCode: optionalText(20),
  quantity,
  unitPrice: money,
  taxRate: percent,
  isRecurring: z.boolean(),
  isActive: z.boolean().default(true),
});

export const serviceParams = z.object({ id: z.uuid(), serviceId: z.uuid() });
