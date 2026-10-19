import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/creative.controller";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { clientParams, creativeFileParams, creativeListQuery, creativeParams, creativeSchema } from "../validators/creative.validators";

/** Mounted at /clients/:clientId/creatives (authentication is applied by the parent router). */
export const creativeRouter = Router({ mergeParams: true });

// Employees work on creatives too; their deletes become approval requests (see the controller).
creativeRouter.use(authorize(access.work));

creativeRouter.get("/", validate(clientParams, "params"), validate(creativeListQuery, "query"), controller.list);
creativeRouter.get("/campaigns", validate(clientParams, "params"), controller.campaigns);
// Upload first (streams files to temp disk), then validate the text fields that arrived with them.
creativeRouter.post("/", validate(clientParams, "params"), upload("CREATIVE", "files", true), validate(creativeSchema), controller.create);
creativeRouter.get("/:creativeId", validate(creativeParams, "params"), controller.get);
creativeRouter.put("/:creativeId", validate(creativeParams, "params"), validate(creativeSchema), controller.update);
creativeRouter.delete("/:creativeId", validate(creativeParams, "params"), controller.remove);
creativeRouter.post("/:creativeId/files", validate(creativeParams, "params"), upload("CREATIVE", "files", true), controller.addFiles);
creativeRouter.delete("/:creativeId/files/:fileId", validate(creativeFileParams, "params"), controller.removeFile);

/** Cross-client gallery at /creatives. */
export const creativeShelfRouter = Router();
creativeShelfRouter.use(authenticate, authorize(access.work));
creativeShelfRouter.get("/", validate(creativeListQuery, "query"), controller.list);
creativeShelfRouter.get("/campaigns", controller.campaigns);
