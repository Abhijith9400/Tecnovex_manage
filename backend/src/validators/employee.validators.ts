import { z } from "zod";
import { DeductionBasis, EmploymentStatus, PayrollStatus } from "../generated/prisma/enums";
import { booleanish, dateOnly, listQuery, money, optionalDate, optionalMoney, optionalText, paymentMethod, period, requiredText, signedMoney } from "./common";

export const employeeSchema = z
  .object({
    employeeCode: optionalText(30),
    fullName: requiredText(150),
    email: z.union([z.email(), z.literal(""), z.null()]).optional().transform((v) => v || null),
    phone: optionalText(40),
    designation: optionalText(120),
    department: optionalText(120),
    joiningDate: dateOnly,
    exitDate: optionalDate,
    status: z.enum(EmploymentStatus),
    pan: optionalText(10).transform((v) => v?.toUpperCase() ?? null),
    bankAccountName: optionalText(150),
    bankAccountNumber: optionalText(40),
    bankIfsc: optionalText(20).transform((v) => v?.toUpperCase() ?? null),
    bankName: optionalText(150),
  })
  .refine((e) => !e.exitDate || e.exitDate >= e.joiningDate, { message: "Exit date must be after the joining date", path: ["exitDate"] });

export const employeeListQuery = listQuery.extend({
  status: z.enum(EmploymentStatus).optional(),
});

export const salaryStructureSchema = z.object({
  effectiveFrom: dateOnly,
  basic: money,
  allowances: money.default("0"),
  otherEarnings: money.default("0"),
  fixedDeductions: money.default("0"),
  applyStatutory: z.boolean().default(false),
  notes: optionalText(1000),
});

export const structureParams = z.object({ id: z.uuid(), structureId: z.uuid() });

const lineItem = z.object({ label: requiredText(80), amount: money });

export const payrollInputSchema = z.object({
  incentives: money.default("0"),
  additionalEarnings: z.array(lineItem).max(10).default([]),
  additionalDeductions: z.array(lineItem).max(10).default([]),
  notes: optionalText(1000),
});

export const payrollCreateSchema = payrollInputSchema.extend({
  employeeId: z.uuid(),
  period,
});

export const payrollGenerateSchema = z.object({ period });

export const payrollPaySchema = z.object({
  paidAt: dateOnly,
  paymentMethod,
  paymentReference: optionalText(100),
});

export const adjustmentSchema = z.object({
  amount: signedMoney,
  reason: requiredText(500),
  paidAt: optionalDate,
  paymentMethod: paymentMethod.nullish(),
  paymentReference: optionalText(100),
});

export const payrollListQuery = listQuery.extend({
  period: period.optional(),
  status: z.enum(PayrollStatus).optional(),
  employeeId: z.uuid().optional(),
});

export const statutorySchema = z.object({
  name: requiredText(80),
  basis: z.enum(DeductionBasis),
  value: money,
  maxAmount: optionalMoney,
  isActive: booleanish.default(true),
  notes: optionalText(1000),
});
