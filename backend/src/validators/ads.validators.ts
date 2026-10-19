import { z } from "zod";
import { AdCampaignStatus, AdCampaignType, AdPlatform, AdSpendSource, WorkTaskType } from "../generated/prisma/enums";
import { dateOnly, dateRangeQuery, listQuery, money, optionalDate, optionalMoney, optionalText, requiredText } from "./common";

/** Boost types must say which post/reel/story was boosted. */
export const BOOST_TYPES: string[] = ["POST_BOOST", "REEL_BOOST", "STORY_BOOST"];

const count = z.coerce.number().int().min(0).max(2_000_000_000).default(0);
const optionalId = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

export const adCampaignSchema = z
  .object({
    clientId: z.uuid({ message: "Choose a client" }),
    projectId: optionalId,
    creativeId: optionalId,
    name: requiredText(200),
    platform: z.enum(AdPlatform),
    campaignType: z.enum(AdCampaignType),
    objective: optionalText(200),
    status: z.enum(AdCampaignStatus),
    startDate: dateOnly,
    endDate: optionalDate,
    budget: optionalMoney,
    spend: money.default("0"),
    paidFrom: z.enum(AdSpendSource),
    impressions: count,
    reach: count,
    clicks: count,
    results: count,
    resultLabel: optionalText(60),
    externalId: optionalText(100),
    postUrl: z
      .union([z.url({ protocol: /^https?$/, message: "Enter a full link starting with https://" }), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    notes: optionalText(5000),
  })
  .refine((c) => !BOOST_TYPES.includes(c.campaignType) || c.creativeId || c.postUrl, {
    message: "For a boost, choose the boosted creative or paste the link to the post",
    path: ["creativeId"],
  })
  .refine((c) => !c.endDate || c.endDate >= c.startDate, { message: "End date must be on or after the start date", path: ["endDate"] })
  .refine((c) => c.clicks <= c.impressions || c.impressions === 0, { message: "Clicks cannot exceed impressions", path: ["clicks"] })
  .refine((c) => c.reach <= c.impressions || c.impressions === 0, { message: "Reach cannot exceed impressions", path: ["reach"] });

export const creativeOptionsQuery = z.object({ clientId: z.uuid() });

export const adCampaignListQuery = listQuery.extend(dateRangeQuery.shape).extend({
  clientId: z.uuid().optional(),
  platform: z.enum(AdPlatform).optional(),
  campaignType: z.enum(AdCampaignType).optional(),
  status: z.enum(AdCampaignStatus).optional(),
  creativeId: z.uuid().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

/** Time is entered as hours (e.g. 1.5) and stored as whole minutes. */
export const workLogSchema = z.object({
  employeeId: optionalId,
  clientId: optionalId,
  workDate: dateOnly,
  hours: z.coerce
    .number()
    .positive("Enter the time spent")
    .max(24, "A single entry cannot exceed 24 hours")
    .refine((h) => Number.isInteger(Math.round(h * 60)) && Math.round(h * 60) >= 5, "Enter at least 5 minutes (0.08 h)"),
  taskType: z.enum(WorkTaskType),
  title: requiredText(200),
  description: optionalText(2000),
  taskId: optionalId,
});

export const workLogListQuery = listQuery.extend(dateRangeQuery.shape).extend({
  employeeId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  taskType: z.enum(WorkTaskType).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
