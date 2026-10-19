import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/finance.controller";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { idParams } from "../validators/common";
import { expenseSchema, financeListQuery, incomeSchema, reportParams, reportQuery } from "../validators/finance.validators";
import { reasonSchema } from "../validators/invoice.validators";

export const expenseRouter = Router();
expenseRouter.use(authenticate, authorize(access.finance));
expenseRouter.get("/", validate(financeListQuery, "query"), controller.listExpenses);
expenseRouter.post("/", upload("EXPENSE_RECEIPT", "receipt"), validate(expenseSchema), controller.createExpense);
expenseRouter.get("/:id", validate(idParams, "params"), controller.getExpense);
expenseRouter.put("/:id", authorize(access.financeEdit), validate(idParams, "params"), upload("EXPENSE_RECEIPT", "receipt"), validate(expenseSchema), controller.updateExpense);
expenseRouter.post("/:id/void", authorize(access.financeEdit), validate(idParams, "params"), validate(reasonSchema), controller.voidExpense);

export const incomeRouter = Router();
incomeRouter.use(authenticate, authorize(access.finance));
incomeRouter.get("/", validate(financeListQuery, "query"), controller.listIncome);
incomeRouter.post("/", upload("INCOME_ATTACHMENT", "attachment"), validate(incomeSchema), controller.createIncome);
incomeRouter.get("/:id", validate(idParams, "params"), controller.getIncome);
incomeRouter.put("/:id", validate(idParams, "params"), upload("INCOME_ATTACHMENT", "attachment"), validate(incomeSchema), controller.updateIncome);
incomeRouter.post("/:id/void", validate(idParams, "params"), validate(reasonSchema), controller.voidIncome);

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
dashboardRouter.get("/", authorize(access.finance), validate(reportQuery, "query"), controller.dashboard);
// Tasks, team workload, creatives and deadlines: for the people who run the work.
dashboardRouter.get("/work", authorize(access.operations), validate(reportQuery, "query"), controller.workDashboard);
// An employee's own tasks, hours and upcoming work.
dashboardRouter.get("/me", authorize(["EMPLOYEE"]), controller.myDashboard);

/** Staff can open Reports; each report category is further restricted in the controller (money/ads/work/audit). */
export const reportRouter = Router();
reportRouter.use(authenticate, authorize(access.staff));
reportRouter.get("/audit-options", authorize(access.management), controller.auditOptions);
reportRouter.get("/:type", validate(reportParams, "params"), validate(reportQuery, "query"), controller.report);
