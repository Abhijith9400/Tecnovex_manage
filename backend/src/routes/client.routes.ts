import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/client.controller";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { clientListQuery, clientSchema, serviceParams, serviceSchema } from "../validators/client.validators";
import { idParams, listQuery } from "../validators/common";
import { creativeRouter } from "./creative.routes";

export const clientRouter = Router();

clientRouter.use(authenticate);

clientRouter.get("/", authorize(access.clientsRead), validate(clientListQuery, "query"), controller.list);
clientRouter.get("/options", authorize(access.clientOptions), controller.options);
clientRouter.post("/", authorize(access.clientsWrite), validate(clientSchema), controller.create);

clientRouter.get("/:id", authorize(access.clientsRead), validate(idParams, "params"), controller.get);
clientRouter.put("/:id", authorize(access.clientsWrite), validate(idParams, "params"), validate(clientSchema), controller.update);
clientRouter.post("/:id/archive", authorize(access.clientsArchive), validate(idParams, "params"), controller.archive);
clientRouter.post("/:id/restore", authorize(access.clientsArchive), validate(idParams, "params"), controller.restore);
clientRouter.get("/:id/summary", authorize(access.finance), validate(idParams, "params"), controller.summary);
clientRouter.get("/:id/activity", authorize(access.staff), validate(idParams, "params"), validate(listQuery, "query"), controller.activity);

clientRouter.post("/:id/services", authorize(access.clientServices), validate(idParams, "params"), validate(serviceSchema), controller.addService);
clientRouter.put("/:id/services/:serviceId", authorize(access.clientServices), validate(serviceParams, "params"), validate(serviceSchema), controller.updateService);
clientRouter.delete("/:id/services/:serviceId", authorize(access.clientServices), validate(serviceParams, "params"), controller.removeService);

clientRouter.use("/:clientId/creatives", creativeRouter);
