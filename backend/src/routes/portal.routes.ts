import { Router } from "express";
import * as calendars from "../controllers/contentCalendar.controller";
import * as controller from "../controllers/portal.controller";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParams } from "../validators/common";
import { fileQuery } from "../validators/contentCalendar.validators";
import { portalListQuery } from "../validators/portal.validators";

/** Client portal. Every query is scoped to the signed-in client's own record in the service layer. */
export const portalRouter = Router();

portalRouter.use(authenticate, authorize(["CLIENT"]));

portalRouter.get("/me", controller.me);
portalRouter.get("/dashboard", controller.dashboard);
portalRouter.get("/creatives", validate(portalListQuery, "query"), controller.list);
portalRouter.get("/creatives/campaigns", controller.campaigns);
portalRouter.get("/creatives/:id", validate(idParams, "params"), controller.get);
portalRouter.get("/creatives/:id/download", validate(idParams, "params"), controller.download);
portalRouter.get("/content-calendars", calendars.portalList);
portalRouter.get("/content-calendars/:id/file", validate(idParams, "params"), validate(fileQuery, "query"), calendars.portalFile);
