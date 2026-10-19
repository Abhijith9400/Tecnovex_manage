import { z } from "zod";
import { CalendarEventType, RecurrenceFrequency } from "../generated/prisma/enums";
import { optionalText, requiredText } from "./common";

const dateOrDateTime = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date/time");

/**
 * All-day events send start/end as YYYY-MM-DD (end inclusive); timed events send ISO date-times.
 * Stored as UTC instants; all-day dates are stored at UTC midnight.
 */
export const calendarEventSchema = z
  .object({
    title: requiredText(200),
    description: optionalText(5000),
    location: optionalText(300),
    eventType: z.enum(CalendarEventType),
    color: z
      .union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    clientId: z
      .union([z.uuid(), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    allDay: z.boolean(),
    start: dateOrDateTime,
    end: dateOrDateTime,
    recurrence: z.enum(RecurrenceFrequency).default("NONE"),
    recurrenceInterval: z.coerce.number().int().min(1).max(365).default(1),
    recurrenceUntil: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null)),
    attendeeIds: z.array(z.uuid()).max(50).default([]),
  })
  .transform((input) => {
    const toUtcDay = (v: string) => new Date(`${v.slice(0, 10)}T00:00:00.000Z`);
    const startAt = input.allDay ? toUtcDay(input.start) : new Date(input.start);
    const endAt = input.allDay ? toUtcDay(input.end) : new Date(input.end);
    return { ...input, startAt, endAt };
  })
  .refine((e) => e.endAt >= e.startAt, { message: "The event must end after it starts", path: ["end"] })
  .refine((e) => e.endAt.getTime() - e.startAt.getTime() <= 366 * 86_400_000, { message: "An event cannot be longer than a year", path: ["end"] })
  .refine((e) => !e.recurrenceUntil || e.recurrenceUntil >= new Date(e.startAt.toISOString().slice(0, 10)), { message: "Repeat end must be after the start", path: ["recurrenceUntil"] });

/** Drag-and-drop move of a single, non-repeating event. */
export const moveEventSchema = z
  .object({ start: dateOrDateTime, end: dateOrDateTime, allDay: z.boolean() })
  .refine((e) => Date.parse(e.end) >= Date.parse(e.start), { message: "The event must end after it starts", path: ["end"] });

const csv = <T extends string>(values: readonly T[]) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((x): x is T => (values as readonly string[]).includes(x)) : undefined));

export const calendarRangeQuery = z
  .object({
    from: dateOrDateTime,
    to: dateOrDateTime,
    clientId: z.uuid().optional(),
    types: csv(Object.values(CalendarEventType)),
    sources: csv(["EVENT", "TASK", "CREATIVE", "AD_CAMPAIGN"] as const),
    mine: z.enum(["true", "false"]).optional(),
  })
  .refine((q) => Date.parse(q.to) > Date.parse(q.from) && Date.parse(q.to) - Date.parse(q.from) <= 400 * 86_400_000, { message: "Choose a range of up to about a year" });

export const deleteEventQuery = z.object({
  /** YYYY-MM-DD: remove only this occurrence of a repeating event. */
  occurrence: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
