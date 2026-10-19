import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/payment.controller";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { idParams } from "../validators/common";
import { reasonSchema } from "../validators/invoice.validators";
import { paymentListQuery, paymentSchema } from "../validators/payment.validators";

export const paymentRouter = Router();

paymentRouter.use(authenticate, authorize(access.finance));

paymentRouter.get("/", validate(paymentListQuery, "query"), controller.list);
paymentRouter.post("/", upload("PAYMENT_PROOF", "proof"), validate(paymentSchema), controller.create);
paymentRouter.get("/:id", validate(idParams, "params"), controller.get);
paymentRouter.post("/:id/void", authorize(access.financeEdit), validate(idParams, "params"), validate(reasonSchema), controller.voidPayment);
paymentRouter.post("/:id/proof", authorize(access.financeEdit), validate(idParams, "params"), upload("PAYMENT_PROOF", "proof"), controller.attachProof);
paymentRouter.get("/:id/receipt", validate(idParams, "params"), controller.receipt);
