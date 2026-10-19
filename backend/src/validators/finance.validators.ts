import { z } from "zod";
import { booleanish, dateOnly, dateRangeQuery, listQuery, optionalText, paymentMethod, positiveMoney, requiredText } from "./common";

/** Multipart fields (optional receipt/attachment file). */
export const expenseSchema = z.object({
  title: requiredText(200),
  categoryId: z.uuid({ message: "Choose a category" }),
  amount: positiveMoney,
  expenseDate: dateOnly,
  vendor: optionalText(200),
  paymentMethod,
  reference: optionalText(100),
  notes: optionalText(2000),
});

export const incomeSchema = z.object({
  description: requiredText(200),
  categoryId: z.uuid({ message: "Choose a category" }),
  amount: positiveMoney,
  incomeDate: dateOnly,
  source: optionalText(200),
  paymentMethod,
  reference: optionalText(100),
  notes: optionalText(2000),
});

export const financeListQuery = listQuery.extend(dateRangeQuery.shape).extend({
  categoryId: z.uuid().optional(),
  paymentMethod: paymentMethod.optional(),
  includeVoided: booleanish.optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export const reportQuery = dateRangeQuery.extend({
  format: z.enum(["json", "csv"]).default("json"),
  clientId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  entityType: z.string().trim().max(60).optional(),
  action: z.string().trim().max(60).optional(),
});

export const reportParams = z.object({
  type: z.enum([
    "monthly-summary",
    "collections",
    "other-income",
    "expenses-by-category",
    "expense-details",
    "outstanding-invoices",
    "client-wise",
    "payroll-totals",
    "ads-campaigns",
    "ads-by-client",
    "ads-by-type",
    "ads-boosted-creatives",
    "work-by-employee",
    "work-by-client",
    "work-by-task",
    "work-log",
    "audit-log",
  ]),
});
