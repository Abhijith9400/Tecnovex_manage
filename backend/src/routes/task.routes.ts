import { Router } from "express";
import { access } from "../config/permissions";
import * as controller from "../controllers/task.controller";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParams } from "../validators/common";
import { taskCommentSchema, taskListQuery, taskSchema, taskStatusSchema } from "../validators/task.validators";

/**
 * Tasks: admins, managers and employees create, edit, reassign and move tasks. Only admins/managers delete;
 * an employee's delete becomes an approval request (see the controller).
 */
export const taskRouter = Router();

taskRouter.use(authenticate, authorize(access.workLog));

taskRouter.get("/", validate(taskListQuery, "query"), controller.list);
taskRouter.get("/options", controller.options);
taskRouter.post("/", validate(taskSchema), controller.create);
taskRouter.get("/:id", validate(idParams, "params"), controller.get);
taskRouter.put("/:id", validate(idParams, "params"), validate(taskSchema), controller.update);
taskRouter.delete("/:id", validate(idParams, "params"), controller.remove);
taskRouter.post("/:id/status", validate(idParams, "params"), validate(taskStatusSchema), controller.setStatus);
taskRouter.post("/:id/comments", validate(idParams, "params"), validate(taskCommentSchema), controller.comment);
