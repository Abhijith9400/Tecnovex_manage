import type { Request } from "express";
import type { z } from "zod";
import { prisma } from "../db/prisma";
import type { CategoryType } from "../generated/prisma/enums";
import { AppError } from "../utils/AppError";
import type { categorySchema, companySettingsSchema, templateSchema } from "../validators/settings.validators";
import { audit, diff } from "./audit.service";
import { deleteStoredFile, publicFile, storeUpload } from "./file.service";
import { isMailConfigured } from "./mail.service";
import { otpAllowedByServer } from "./otp.service";

const settingsInclude = { logoFile: true, activeTemplate: true } as const;

export async function getCompanySettings() {
  const settings = await prisma.companySettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {}, include: settingsInclude });
  const { logoFile, ...rest } = settings;
  return { ...rest, logo: publicFile(logoFile) };
}

export async function updateCompanySettings(req: Request, input: z.infer<typeof companySettingsSchema>) {
  if (input.isGstRegistered && !input.gstin) throw AppError.badRequest("Enter the GSTIN or turn off GST registration");
  if (input.activeTemplateId && !(await prisma.invoiceTemplate.findUnique({ where: { id: input.activeTemplateId } }))) {
    throw AppError.badRequest("Selected invoice template not found");
  }
  const before = await prisma.companySettings.findUniqueOrThrow({ where: { id: 1 } });
  await prisma.$transaction(async (tx) => {
    await tx.companySettings.update({ where: { id: 1 }, data: input });
    await audit(req, { action: "UPDATE", entityType: "CompanySettings", entityId: "1", summary: "Company settings updated", changes: diff(before, input) }, tx);
  });
  return getCompanySettings();
}

export async function setLogo(req: Request, file: Express.Multer.File) {
  const current = await prisma.companySettings.findUniqueOrThrow({ where: { id: 1 } });
  const stored = await storeUpload(file, "BRANDING", req.user?.id);
  await prisma.companySettings.update({ where: { id: 1 }, data: { logoFileId: stored.id } });
  if (current.logoFileId) await deleteStoredFile(current.logoFileId);
  await audit(req, { action: "UPDATE", entityType: "CompanySettings", entityId: "1", summary: "Company logo updated" });
  return getCompanySettings();
}

export async function removeLogo(req: Request) {
  const current = await prisma.companySettings.findUniqueOrThrow({ where: { id: 1 } });
  if (current.logoFileId) {
    await prisma.companySettings.update({ where: { id: 1 }, data: { logoFileId: null } });
    await deleteStoredFile(current.logoFileId);
    await audit(req, { action: "UPDATE", entityType: "CompanySettings", entityId: "1", summary: "Company logo removed" });
  }
  return getCompanySettings();
}

// --- sign-in security ---

export async function getSecuritySettings() {
  const settings = await prisma.companySettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {}, select: { loginOtpEnabled: true } });
  return { loginOtpEnabled: settings.loginOtpEnabled, serverAllowsOtp: otpAllowedByServer(), mailConfigured: isMailConfigured() };
}

export async function updateSecuritySettings(req: Request, input: { loginOtpEnabled: boolean }) {
  const before = await prisma.companySettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {}, select: { loginOtpEnabled: true } });
  if (before.loginOtpEnabled !== input.loginOtpEnabled) {
    await prisma.$transaction(async (tx) => {
      await tx.companySettings.update({ where: { id: 1 }, data: { loginOtpEnabled: input.loginOtpEnabled } });
      await audit(
        req,
        {
          action: "UPDATE",
          entityType: "CompanySettings",
          entityId: "1",
          summary: input.loginOtpEnabled ? "Email code at sign-in turned on" : "Email code at sign-in turned off",
          changes: diff(before, input),
        },
        tx,
      );
    });
  }
  return getSecuritySettings();
}

// --- invoice templates ---

function shapeTemplate<T extends { signatureFile: Parameters<typeof publicFile>[0]; referenceFile: Parameters<typeof publicFile>[0] }>(template: T) {
  const { signatureFile, referenceFile, ...rest } = template;
  return { ...rest, signature: publicFile(signatureFile), reference: publicFile(referenceFile) };
}

export async function listTemplates() {
  const templates = await prisma.invoiceTemplate.findMany({ include: { signatureFile: true, referenceFile: true }, orderBy: { createdAt: "asc" } });
  return templates.map(shapeTemplate);
}

export async function getTemplate(id: string) {
  const template = await prisma.invoiceTemplate.findUnique({ where: { id }, include: { signatureFile: true, referenceFile: true } });
  if (!template) throw AppError.notFound("Template");
  return shapeTemplate(template);
}

export async function createTemplate(req: Request, input: z.infer<typeof templateSchema>) {
  const template = await prisma.invoiceTemplate.create({ data: input });
  await audit(req, { action: "CREATE", entityType: "InvoiceTemplate", entityId: template.id, summary: `Invoice template "${template.name}" created` });
  return getTemplate(template.id);
}

export async function updateTemplate(req: Request, id: string, input: z.infer<typeof templateSchema>) {
  const before = await prisma.invoiceTemplate.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Template");
  await prisma.invoiceTemplate.update({ where: { id }, data: input });
  await audit(req, { action: "UPDATE", entityType: "InvoiceTemplate", entityId: id, summary: `Invoice template "${input.name}" updated`, changes: diff(before, input) });
  return getTemplate(id);
}

export async function deleteTemplate(req: Request, id: string) {
  const template = await prisma.invoiceTemplate.findUnique({ where: { id }, include: { _count: { select: { invoices: true } } } });
  if (!template) throw AppError.notFound("Template");
  const settings = await prisma.companySettings.findUniqueOrThrow({ where: { id: 1 } });
  if (settings.activeTemplateId === id) throw AppError.badRequest("Choose another active template before deleting this one");
  if (template._count.invoices > 0) throw AppError.badRequest("This template is used by existing invoices and cannot be deleted");
  await prisma.invoiceTemplate.delete({ where: { id } });
  for (const fileId of [template.signatureFileId, template.referenceFileId]) if (fileId) await deleteStoredFile(fileId);
  await audit(req, { action: "DELETE", entityType: "InvoiceTemplate", entityId: id, summary: `Invoice template "${template.name}" deleted` });
}

export async function setTemplateFile(req: Request, id: string, kind: "signature" | "reference", file: Express.Multer.File) {
  const template = await prisma.invoiceTemplate.findUnique({ where: { id } });
  if (!template) throw AppError.notFound("Template");
  if (kind === "signature" && !["image/png", "image/jpeg"].includes(file.mimetype)) {
    throw AppError.badRequest("Signature must be a PNG or JPEG image");
  }
  const stored = await storeUpload(file, "BRANDING", req.user?.id);
  const field = kind === "signature" ? "signatureFileId" : "referenceFileId";
  const previous = template[field];
  await prisma.invoiceTemplate.update({ where: { id }, data: { [field]: stored.id } });
  if (previous) await deleteStoredFile(previous);
  await audit(req, { action: "UPDATE", entityType: "InvoiceTemplate", entityId: id, summary: `Template ${kind} file uploaded` });
  return getTemplate(id);
}

export async function removeTemplateFile(req: Request, id: string, kind: "signature" | "reference") {
  const template = await prisma.invoiceTemplate.findUnique({ where: { id } });
  if (!template) throw AppError.notFound("Template");
  const field = kind === "signature" ? "signatureFileId" : "referenceFileId";
  const previous = template[field];
  if (previous) {
    await prisma.invoiceTemplate.update({ where: { id }, data: { [field]: null } });
    await deleteStoredFile(previous);
    await audit(req, { action: "UPDATE", entityType: "InvoiceTemplate", entityId: id, summary: `Template ${kind} file removed` });
  }
  return getTemplate(id);
}

// --- categories ---

export function listCategories(type?: CategoryType) {
  return prisma.category.findMany({ where: type ? { type } : {}, orderBy: [{ type: "asc" }, { name: "asc" }] });
}

export async function createCategory(req: Request, input: z.infer<typeof categorySchema>) {
  const exists = await prisma.category.findUnique({ where: { type_name: input } });
  if (exists) throw AppError.conflict("A category with this name already exists");
  const category = await prisma.category.create({ data: input });
  await audit(req, { action: "CREATE", entityType: "Category", entityId: category.id, summary: `${input.type} category "${input.name}" created` });
  return category;
}

export async function updateCategory(req: Request, id: string, input: { name?: string; isActive?: boolean }) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw AppError.notFound("Category");
  if (input.name && input.name !== category.name) {
    const clash = await prisma.category.findUnique({ where: { type_name: { type: category.type, name: input.name } } });
    if (clash) throw AppError.conflict("A category with this name already exists");
  }
  const updated = await prisma.category.update({ where: { id }, data: input });
  await audit(req, { action: "UPDATE", entityType: "Category", entityId: id, summary: `Category "${updated.name}" updated`, changes: diff(category, input) });
  return updated;
}
