import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/calendar.controller";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { calendarEventSchema, calendarRangeQuery, deleteEventQuery, moveEventSchema } from "../validators/calendar.validators";
import { idParams } from "../validators/common";

/**
 * Team calendar: every internal role can view; admins, managers and employees add and edit events. An
 * employee's delete becomes an approval request (see the controller).
 */
export const calendarRouter = Router();

calendarRouter.use(authenticate, authorize(access.adsRead));

calendarRouter.get("/", validate(calendarRangeQuery, "query"), controller.range);
calendarRouter.post("/events", validate(calendarEventSchema), controller.create);
calendarRouter.get("/events/:id", validate(idParams, "params"), controller.get);
calendarRouter.put("/events/:id", validate(idParams, "params"), validate(calendarEventSchema), controller.update);
calendarRouter.patch("/events/:id/move", validate(idParams, "params"), validate(moveEventSchema), controller.move);
calendarRouter.delete("/events/:id", validate(idParams, "params"), validate(deleteEventQuery, "query"), controller.remove);
