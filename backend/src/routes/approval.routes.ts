import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/approval.controller";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { approvalListQuery, reviewSchema } from "../validators/approval.validators";
import { idParams } from "../validators/common";

/** Approval queue. Who may review each kind of request is checked in the service. */
export const approvalRouter = Router();

approvalRouter.use(authenticate, authorize(access.approvals));

approvalRouter.get("/", validate(approvalListQuery, "query"), controller.list);
approvalRouter.get("/counts", controller.counts);
approvalRouter.get("/:id", validate(idParams, "params"), controller.get);
approvalRouter.post("/:id/approve", validate(idParams, "params"), validate(reviewSchema), controller.approve);
approvalRouter.post("/:id/reject", validate(idParams, "params"), validate(reviewSchema), controller.reject);
approvalRouter.post("/:id/cancel", validate(idParams, "params"), controller.cancel);
