import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { sendStoredFile } from "../services/file.service";
import { idParams } from "../validators/common";

/** All stored files are served through here; access is checked per file category in sendStoredFile. */
export const filesRouter = Router();

filesRouter.use(authenticate);
filesRouter.get("/:id", validate(idParams, "params"), (req, res) => sendStoredFile(req, res, String(req.params.id), false));
filesRouter.get("/:id/download", validate(idParams, "params"), (req, res) => sendStoredFile(req, res, String(req.params.id), true));
