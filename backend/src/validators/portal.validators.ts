import { z } from "zod";
import { CreativePlatform, CreativeType } from "../generated/prisma/enums";
import { listQuery, period } from "./common";

export const portalListQuery = listQuery.extend({
  month: period.optional(),
  campaign: z.string().trim().max(120).optional(),
  platform: z.enum(CreativePlatform).optional(),
  contentType: z.enum(CreativeType).optional(),
});
