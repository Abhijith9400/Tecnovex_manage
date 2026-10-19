import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/employee.controller";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParams } from "../validators/common";
import {
  adjustmentSchema,
  employeeListQuery,
  employeeSchema,
  payrollCreateSchema,
  payrollGenerateSchema,
  payrollInputSchema,
  payrollListQuery,
  payrollPaySchema,
  salaryStructureSchema,
  statutorySchema,
  structureParams,
} from "../validators/employee.validators";

/** Employee records (including bank details) are restricted to administrators and managers. */
export const employeeRouter = Router();

employeeRouter.use(authenticate);
// Names and IDs only (no salary/bank data), for picking people in the work log, tasks and calendar guests.
employeeRouter.get("/options", authorize(access.workLog), controller.options);
employeeRouter.use(authorize(access.management));

employeeRouter.get("/", validate(employeeListQuery, "query"), controller.list);
employeeRouter.post("/", validate(employeeSchema), controller.create);
employeeRouter.get("/:id", validate(idParams, "params"), controller.get);
employeeRouter.put("/:id", validate(idParams, "params"), validate(employeeSchema), controller.update);
employeeRouter.post("/:id/salary-structures", validate(idParams, "params"), validate(salaryStructureSchema), controller.addStructure);
employeeRouter.delete("/:id/salary-structures/:structureId", validate(structureParams, "params"), controller.deleteStructure);

export const payrollRouter = Router();

payrollRouter.use(authenticate);

// Employee self-service (own paid payslips). Admin and employee access to a single record is checked in the service.
payrollRouter.get("/my", authorize(["EMPLOYEE", "ADMIN", "MANAGER"]), validate(payrollListQuery, "query"), controller.myPayroll);
payrollRouter.get("/statutory-deductions", authorize(access.management), controller.listStatutory);
payrollRouter.post("/statutory-deductions", authorize(access.management), validate(statutorySchema), controller.createStatutory);
payrollRouter.put("/statutory-deductions/:id", authorize(access.management), validate(idParams, "params"), validate(statutorySchema), controller.updateStatutory);

payrollRouter.get("/:id/payslip", authorize(["ADMIN", "MANAGER", "EMPLOYEE"]), validate(idParams, "params"), controller.payslip);
payrollRouter.get("/:id", authorize(["ADMIN", "MANAGER", "EMPLOYEE"]), validate(idParams, "params"), controller.getPayroll);

payrollRouter.use(authorize(access.management));
payrollRouter.get("/", validate(payrollListQuery, "query"), controller.listPayroll);
payrollRouter.post("/", validate(payrollCreateSchema), controller.createPayroll);
payrollRouter.post("/generate", validate(payrollGenerateSchema), controller.generatePayroll);
payrollRouter.put("/:id", validate(idParams, "params"), validate(payrollInputSchema), controller.updatePayroll);
payrollRouter.delete("/:id", validate(idParams, "params"), controller.removePayroll);
payrollRouter.post("/:id/approve", validate(idParams, "params"), controller.approve);
payrollRouter.post("/:id/reopen", validate(idParams, "params"), controller.reopen);
payrollRouter.post("/:id/pay", validate(idParams, "params"), validate(payrollPaySchema), controller.pay);
payrollRouter.post("/:id/adjustments", validate(idParams, "params"), validate(adjustmentSchema), controller.addAdjustment);
