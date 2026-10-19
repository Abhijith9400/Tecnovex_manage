import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/agreement.controller";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { agreementListQuery, agreementSchema, documentBody, documentParams, projectListQuery, projectSchema } from "../validators/agreement.validators";
import { idParams } from "../validators/common";

export const agreementRouter = Router();

agreementRouter.use(authenticate);

agreementRouter.get("/", authorize(access.agreementsRead), validate(agreementListQuery, "query"), controller.list);
agreementRouter.post("/", authorize(access.operations), validate(agreementSchema), controller.create);
agreementRouter.get("/:id", authorize(access.agreementsRead), validate(idParams, "params"), controller.get);
agreementRouter.put("/:id", authorize(access.operations), validate(idParams, "params"), validate(agreementSchema), controller.update);
agreementRouter.post("/:id/archive", authorize(access.operations), validate(idParams, "params"), controller.archive);
agreementRouter.post("/:id/restore", authorize(access.operations), validate(idParams, "params"), controller.restore);
agreementRouter.post(
  "/:id/documents",
  authorize(access.operations),
  validate(idParams, "params"),
  upload("AGREEMENT", "files", true),
  validate(documentBody),
  controller.addDocuments,
);
agreementRouter.delete("/:id/documents/:fileId", authorize(access.operations), validate(documentParams, "params"), controller.removeDocument);

export const projectRouter = Router();

projectRouter.use(authenticate);

projectRouter.get("/", authorize(access.projectsRead), validate(projectListQuery, "query"), controller.listProjects);
projectRouter.post("/", authorize(access.operations), validate(projectSchema), controller.createProject);
projectRouter.get("/:id", authorize(access.projectsRead), validate(idParams, "params"), controller.getProject);
projectRouter.put("/:id", authorize(access.operations), validate(idParams, "params"), validate(projectSchema), controller.updateProject);
projectRouter.delete("/:id", authorize(access.operations), validate(idParams, "params"), controller.deleteProject);
