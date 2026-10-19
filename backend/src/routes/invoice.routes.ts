import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/invoice.controller";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { idParams } from "../validators/common";
import { generateMonthlySchema, generateSchema, invoiceListQuery, invoiceSchema, issuedUpdateSchema, reasonSchema } from "../validators/invoice.validators";
import { paymentSchema } from "../validators/payment.validators";

export const invoiceRouter = Router();

invoiceRouter.use(authenticate, authorize(access.finance));

invoiceRouter.get("/", validate(invoiceListQuery, "query"), controller.list);
invoiceRouter.post("/", validate(invoiceSchema), controller.create);
invoiceRouter.post("/generate", validate(generateSchema), controller.generate);
invoiceRouter.post("/generate-monthly", validate(generateMonthlySchema), controller.generateMonthly);

invoiceRouter.get("/:id", validate(idParams, "params"), controller.get);
invoiceRouter.put("/:id", validate(idParams, "params"), validate(invoiceSchema), controller.update);
invoiceRouter.patch("/:id", validate(idParams, "params"), validate(issuedUpdateSchema), controller.updateIssued);
invoiceRouter.delete("/:id", validate(idParams, "params"), controller.remove);
invoiceRouter.post("/:id/issue", validate(idParams, "params"), controller.issue);
invoiceRouter.post("/:id/cancel", validate(idParams, "params"), validate(reasonSchema), controller.cancel);
invoiceRouter.post("/:id/revise", validate(idParams, "params"), validate(reasonSchema), controller.revise);
invoiceRouter.get("/:id/pdf", validate(idParams, "params"), controller.pdf);
invoiceRouter.get("/:id/payments", validate(idParams, "params"), controller.payments);
invoiceRouter.post("/:id/payments", validate(idParams, "params"), upload("PAYMENT_PROOF", "proof"), validate(paymentSchema), controller.recordPayment);
