import { z } from "zod";
import { optionalText, period, requiredText } from "./common";

/** Multipart forms send booleans as strings. */
const flag = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .optional()
  .transform((v) => v === undefined || v === true || v === "true");

export const contentCalendarSchema = z.object({
  clientId: z.uuid({ message: "Choose a client" }),
  period,
  title: requiredText(200),
  notes: optionalText(2000),
  sharedWithClient: flag,
});

export const contentCalendarUpdateSchema = z.object({
  period,
  title: requiredText(200),
  notes: optionalText(2000),
  sharedWithClient: z.boolean(),
});

export const contentCalendarListQuery = z.object({
  clientId: z.uuid().optional(),
  period: period.optional(),
});

export const fileQuery = z.object({
  download: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
