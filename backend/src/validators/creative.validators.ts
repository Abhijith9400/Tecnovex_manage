import { z } from "zod";
import { CreativePlatform, CreativeStatus, CreativeType } from "../generated/prisma/enums";
import { listQuery, optionalDate, optionalText, period, requiredText } from "./common";

/** Multipart forms send everything as strings, so blank values become null. */
export const creativeSchema = z.object({
  title: requiredText(200),
  campaign: optionalText(120),
  contentType: z.enum(CreativeType),
  platform: z.enum(CreativePlatform),
  status: z.enum(CreativeStatus),
  publishDate: optionalDate,
  caption: optionalText(5000),
  internalNotes: optionalText(5000),
  projectId: z
    .union([z.uuid(), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
});

export const creativeListQuery = listQuery.extend({
  clientId: z.uuid().optional(),
  month: period.optional(),
  campaign: z.string().trim().max(120).optional(),
  platform: z.enum(CreativePlatform).optional(),
  contentType: z.enum(CreativeType).optional(),
  status: z.enum(CreativeStatus).optional(),
});

export const creativeParams = z.object({ clientId: z.uuid(), creativeId: z.uuid() });
export const creativeFileParams = creativeParams.extend({ fileId: z.uuid() });
export const clientParams = z.object({ clientId: z.uuid() });
