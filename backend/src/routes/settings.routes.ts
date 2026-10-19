import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/settings.controller";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { idParams } from "../validators/common";
import {
  categoryQuery,
  categorySchema,
  categoryUpdateSchema,
  companySettingsSchema,
  securitySettingsSchema,
  templateFileParams,
  templateSchema,
} from "../validators/settings.validators";

export const settingsRouter = Router();

settingsRouter.use(authenticate);

// Company details are readable by staff (needed on invoices, receipts and the UI); admins and managers change them.
settingsRouter.get("/company", authorize(access.staff), controller.getCompany);
settingsRouter.put("/company", authorize(access.management), validate(companySettingsSchema), controller.updateCompany);
settingsRouter.post("/company/logo", authorize(access.management), upload("BRANDING", "file"), controller.uploadLogo);
settingsRouter.delete("/company/logo", authorize(access.management), controller.removeLogo);

// Sign-in security (email code at sign-in): admins only.
settingsRouter.get("/security", authorize(access.admin), controller.getSecurity);
settingsRouter.put("/security", authorize(access.admin), validate(securitySettingsSchema), controller.updateSecurity);

settingsRouter.get("/templates", authorize(access.finance), controller.listTemplates);
settingsRouter.post("/templates", authorize(access.management), validate(templateSchema), controller.createTemplate);
settingsRouter.get("/templates/:id", authorize(access.finance), validate(idParams, "params"), controller.getTemplate);
settingsRouter.get("/templates/:id/preview", authorize(access.finance), validate(idParams, "params"), controller.previewTemplate);
settingsRouter.put("/templates/:id", authorize(access.management), validate(idParams, "params"), validate(templateSchema), controller.updateTemplate);
settingsRouter.delete("/templates/:id", authorize(access.management), validate(idParams, "params"), controller.deleteTemplate);
settingsRouter.post(
  "/templates/:id/:kind",
  authorize(access.management),
  validate(templateFileParams, "params"),
  upload("BRANDING", "file", false, ["image/png", "image/jpeg", "application/pdf"]),
  controller.uploadTemplateFile,
);
settingsRouter.delete("/templates/:id/:kind", authorize(access.management), validate(templateFileParams, "params"), controller.removeTemplateFile);

settingsRouter.get("/categories", authorize(access.staff), validate(categoryQuery, "query"), controller.listCategories);
settingsRouter.post("/categories", authorize(access.finance), validate(categorySchema), controller.createCategory);
settingsRouter.patch("/categories/:id", authorize(access.finance), validate(idParams, "params"), validate(categoryUpdateSchema), controller.updateCategory);
