import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/contentCalendar.controller";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { idParams } from "../validators/common";
import { contentCalendarListQuery, contentCalendarSchema, contentCalendarUpdateSchema, fileQuery } from "../validators/contentCalendar.validators";

/** Content calendars per client and month. Staff and employees manage them; clients read shared ones via /portal. */
export const contentCalendarRouter = Router();

contentCalendarRouter.use(authenticate);

contentCalendarRouter.get("/", authorize(access.adsRead), validate(contentCalendarListQuery, "query"), controller.list);
contentCalendarRouter.get("/preview", authorize(access.adsRead), validate(contentCalendarListQuery, "query"), controller.preview);
// Upload first (streams to temp disk), then validate the text fields that arrived with it. No file = generated from the calendar.
contentCalendarRouter.post("/", authorize(access.work), upload("CONTENT_CALENDAR", "file"), validate(contentCalendarSchema), controller.create);
contentCalendarRouter.put("/:id", authorize(access.work), validate(idParams, "params"), validate(contentCalendarUpdateSchema), controller.update);
contentCalendarRouter.delete("/:id", authorize(access.work), validate(idParams, "params"), controller.remove);
contentCalendarRouter.get("/:id/file", authorize(access.adsRead), validate(idParams, "params"), validate(fileQuery, "query"), controller.file);
