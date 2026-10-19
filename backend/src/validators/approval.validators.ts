import { z } from "zod";
import { ApprovalKind, ApprovalStatus } from "../generated/prisma/enums";
import { listQuery, optionalText } from "./common";

export const approvalListQuery = listQuery.extend({
  status: z.enum(ApprovalStatus).optional(),
  kind: z.enum(ApprovalKind).optional(),
  mine: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  /** Only pending requests this user can approve. */
  toReview: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const reviewSchema = z.object({ note: optionalText(500) });
