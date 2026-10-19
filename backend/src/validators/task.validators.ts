import { z } from "zod";
import { TaskPriority, TaskStatus, WorkTaskType } from "../generated/prisma/enums";
import { booleanish, listQuery, optionalDate, optionalText, requiredText } from "./common";

const optionalId = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

export const taskSchema = z.object({
  title: requiredText(200),
  description: optionalText(5000),
  clientId: optionalId,
  assigneeId: z.uuid({ message: "Choose who this task is for" }),
  taskType: z.enum(WorkTaskType),
  priority: z.enum(TaskPriority),
  status: z.enum(TaskStatus).default("TODO"),
  dueDate: optionalDate,
  estimatedHours: z
    .union([z.coerce.number().min(0.25).max(999), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

/** Employees may only move their task along; managers can set any status. */
export const taskStatusSchema = z.object({ status: z.enum(TaskStatus) });

export const taskCommentSchema = z.object({ body: requiredText(2000) });

export const taskListQuery = listQuery.extend({
  assigneeId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  /** true = only tasks past their due date and not done/cancelled. */
  overdue: booleanish.optional(),
  /** true = hide DONE and CANCELLED (default for the board). */
  openOnly: booleanish.optional(),
});
