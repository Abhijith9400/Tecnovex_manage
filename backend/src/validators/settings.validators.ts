import { z } from "zod";
import { CategoryType, InvoiceLayout } from "../generated/prisma/enums";
import { booleanish, optionalText, percent, requiredText } from "./common";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #172554");

export const companySettingsSchema = z.object({
  legalName: requiredText(200),
  tradingName: optionalText(200),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: requiredText(100),
  email: optionalText(200),
  phone: optionalText(50),
  website: optionalText(200),
  pan: optionalText(20),
  isGstRegistered: z.boolean(),
  gstin: optionalText(20),
  taxLabel: requiredText(30),
  defaultTaxRate: percent,
  splitTaxOnInvoice: z.boolean(),
  otherTaxInfo: optionalText(500),
  bankName: optionalText(200),
  bankAccountName: optionalText(200),
  bankAccountNumber: optionalText(50),
  bankIfsc: optionalText(20),
  bankBranch: optionalText(200),
  upiId: optionalText(100),
  currency: z.string().trim().length(3).toUpperCase(),
  invoicePrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  invoiceNumberPadding: z.coerce.number().int().min(1).max(8),
  invoiceUseFinancialYear: z.boolean(),
  receiptPrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365),
  paymentTermsText: optionalText(1000),
  invoiceNotes: optionalText(1000),
  activeTemplateId: z.uuid().nullish(),
});

export const templateSchema = z.object({
  name: requiredText(100),
  layout: z.enum(InvoiceLayout),
  primaryColor: hexColor,
  accentColor: hexColor,
  headerText: optionalText(300),
  footerText: optionalText(500),
  termsText: optionalText(2000),
  showLogo: booleanish,
  showBankDetails: booleanish,
  showSignature: booleanish,
  signatureLabel: requiredText(60),
});

export const categorySchema = z.object({
  type: z.enum(CategoryType),
  name: requiredText(80),
});

export const categoryUpdateSchema = z.object({
  name: requiredText(80).optional(),
  isActive: z.boolean().optional(),
});

export const categoryQuery = z.object({ type: z.enum(CategoryType).optional() });

export const templateFileParams = z.object({ id: z.uuid(), kind: z.enum(["signature", "reference"]) });

export const securitySettingsSchema = z.object({ loginOtpEnabled: z.boolean() });
