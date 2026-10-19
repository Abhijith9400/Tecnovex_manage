import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/ads.controller";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { adCampaignListQuery, adCampaignSchema, creativeOptionsQuery, workLogListQuery, workLogSchema } from "../validators/ads.validators";
import { idParams } from "../validators/common";

/** Ad campaigns: staff and employees read and record them (accountants read only); only admins/managers delete. */
export const adCampaignRouter = Router();
adCampaignRouter.use(authenticate);
adCampaignRouter.get("/", authorize(access.adsRead), validate(adCampaignListQuery, "query"), controller.listCampaigns);
adCampaignRouter.get("/creative-options", authorize(access.adsRead), validate(creativeOptionsQuery, "query"), controller.creativeOptions);
adCampaignRouter.post("/", authorize(access.adsWrite), validate(adCampaignSchema), controller.createCampaign);
adCampaignRouter.get("/:id", authorize(access.adsRead), validate(idParams, "params"), controller.getCampaign);
adCampaignRouter.put("/:id", authorize(access.adsWrite), validate(idParams, "params"), validate(adCampaignSchema), controller.updateCampaign);
// Employees may ask to delete; the controller turns that into an approval request.
adCampaignRouter.delete("/:id", authorize(access.adsWrite), validate(idParams, "params"), controller.deleteCampaign);

/** Work log: admins/managers manage everyone's entries; employees only their own (enforced in the service). */
export const workLogRouter = Router();
workLogRouter.use(authenticate, authorize(access.workLog));
workLogRouter.get("/", validate(workLogListQuery, "query"), controller.listLogs);
workLogRouter.post("/", validate(workLogSchema), controller.createLog);
workLogRouter.put("/:id", validate(idParams, "params"), validate(workLogSchema), controller.updateLog);
workLogRouter.delete("/:id", validate(idParams, "params"), controller.deleteLog);
