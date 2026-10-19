import { z } from "zod";
import { AgreementStatus, ProjectStatus } from "../generated/prisma/enums";
import { booleanish, dateOnly, listQuery, optionalDate, optionalInt, optionalMoney, optionalText, requiredText } from "./common";

export const agreementSchema = z
  .object({
    clientId: z.uuid(),
    title: requiredText(200),
    reference: optionalText(100),
    effectiveDate: dateOnly,
    expiryDate: optionalDate,
    contractValue: optionalMoney,
    status: z.enum(AgreementStatus),
    scopeOfWork: optionalText(10000),
    monthlyDeliverables: optionalText(5000),
    postsPerMonth: optionalInt,
    carouselsPerMonth: optionalInt,
    reelsPerMonth: optionalInt,
    revisionLimit: optionalInt,
    exclusions: optionalText(5000),
    paymentTerms: optionalText(2000),
    renewalReminderDays: z.coerce.number().int().min(0).max(365).default(30),
    notes: optionalText(5000),
  })
  .refine((a) => !a.expiryDate || a.expiryDate >= a.effectiveDate, { message: "Expiry date must be on or after the effective date", path: ["expiryDate"] });

export const agreementListQuery = listQuery.extend({
  clientId: z.uuid().optional(),
  status: z.enum(AgreementStatus).optional(),
  renewal: z.enum(["DUE_SOON", "EXPIRED"]).optional(),
  archived: booleanish.optional(),
});

export const documentParams = z.object({ id: z.uuid(), fileId: z.uuid() });
export const documentBody = z.object({ label: optionalText(120) });

export const projectSchema = z
  .object({
    clientId: z.uuid(),
    agreementId: z
      .union([z.uuid(), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    name: requiredText(200),
    description: optionalText(5000),
    status: z.enum(ProjectStatus),
    startDate: optionalDate,
    endDate: optionalDate,
    budget: optionalMoney,
  })
  .refine((p) => !p.startDate || !p.endDate || p.endDate >= p.startDate, { message: "End date must be on or after the start date", path: ["endDate"] });

export const projectListQuery = listQuery.extend({
  clientId: z.uuid().optional(),
  status: z.enum(ProjectStatus).optional(),
});
