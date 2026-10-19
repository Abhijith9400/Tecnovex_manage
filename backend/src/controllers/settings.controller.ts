import type { Request, Response } from "express";
import { loadTemplatePreviewData, renderInvoicePdf } from "../services/pdf/invoicePdf";
import * as settingsService from "../services/settings.service";
import { AppError } from "../utils/AppError";
import { sendSuccess } from "../utils/apiResponse";
import { sendPdf } from "../utils/pdfResponse";

function requireFile(req: Request) {
  if (!req.file) throw AppError.badRequest("Choose a file to upload");
  return req.file;
}

export async function getCompany(_req: Request, res: Response) {
  sendSuccess(res, await settingsService.getCompanySettings());
}

export async function updateCompany(req: Request, res: Response) {
  sendSuccess(res, await settingsService.updateCompanySettings(req, req.body));
}

export async function getSecurity(_req: Request, res: Response) {
  sendSuccess(res, await settingsService.getSecuritySettings());
}

export async function updateSecurity(req: Request, res: Response) {
  sendSuccess(res, await settingsService.updateSecuritySettings(req, req.body));
}

export async function uploadLogo(req: Request, res: Response) {
  sendSuccess(res, await settingsService.setLogo(req, requireFile(req)));
}

export async function removeLogo(req: Request, res: Response) {
  sendSuccess(res, await settingsService.removeLogo(req));
}

export async function listTemplates(_req: Request, res: Response) {
  sendSuccess(res, await settingsService.listTemplates());
}

export async function getTemplate(req: Request, res: Response) {
  sendSuccess(res, await settingsService.getTemplate(String(req.params.id)));
}

/** Renders the template with clearly marked sample data (watermarked SAMPLE). */
export async function previewTemplate(req: Request, res: Response) {
  const buffer = await renderInvoicePdf(await loadTemplatePreviewData(String(req.params.id)));
  sendPdf(res, buffer, "template-preview.pdf", false);
}

export async function createTemplate(req: Request, res: Response) {
  sendSuccess(res, await settingsService.createTemplate(req, req.body), 201);
}

export async function updateTemplate(req: Request, res: Response) {
  sendSuccess(res, await settingsService.updateTemplate(req, String(req.params.id), req.body));
}

export async function deleteTemplate(req: Request, res: Response) {
  await settingsService.deleteTemplate(req, String(req.params.id));
  sendSuccess(res, { deleted: true });
}

export async function uploadTemplateFile(req: Request, res: Response) {
  const kind = req.params.kind as "signature" | "reference";
  sendSuccess(res, await settingsService.setTemplateFile(req, String(req.params.id), kind, requireFile(req)));
}

export async function removeTemplateFile(req: Request, res: Response) {
  const kind = req.params.kind as "signature" | "reference";
  sendSuccess(res, await settingsService.removeTemplateFile(req, String(req.params.id), kind));
}

export async function listCategories(_req: Request, res: Response) {
  sendSuccess(res, await settingsService.listCategories(res.locals.query?.type));
}

export async function createCategory(req: Request, res: Response) {
  sendSuccess(res, await settingsService.createCategory(req, req.body), 201);
}

export async function updateCategory(req: Request, res: Response) {
  sendSuccess(res, await settingsService.updateCategory(req, String(req.params.id), req.body));
}
