/**
 * Team calendar: user-created events (with repeats and guests) plus read-only "linked" items from the rest of the
 * app — task due dates, creative publication dates and ad campaign runs — returned as one list of occurrences.
 */
import type { Request } from "express";
import type { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import type { AuthUser } from "../types/express";
import { AppError } from "../utils/AppError";
import { expandOccurrences } from "../utils/recurrence";
import type { calendarEventSchema, calendarRangeQuery } from "../validators/calendar.validators";
import { audit } from "./audit.service";

type EventInput = z.infer<typeof calendarEventSchema>;
type RangeQuery = z.infer<typeof calendarRangeQuery>;

const MANAGERS = ["ADMIN", "MANAGER"];
const CREATORS = ["ADMIN", "MANAGER", "EMPLOYEE"];

export interface CalendarItem {
  /** Unique per occurrence. */
  id: string;
  source: "EVENT" | "TASK" | "CREATIVE" | "AD_CAMPAIGN";
  /** Underlying record id (event, task, creative or campaign). */
  refId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  eventType: string | null;
  color: string | null;
  client: { id: string; name: string } | null;
  recurring: boolean;
  /** YYYY-MM-DD of this occurrence (repeating events). */
  occurrenceDate: string | null;
  canEdit: boolean;
  location: string | null;
  meta: string | null;
  href: string | null;
}

const eventInclude = {
  client: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  attendees: { include: { employee: { select: { id: true, fullName: true, employeeCode: true } } } },
} satisfies Prisma.CalendarEventInclude;

type EventRow = Prisma.CalendarEventGetPayload<{ include: typeof eventInclude }>;

export function canEdit(user: AuthUser, _event?: { createdById: string | null }) {
  // Admins, managers and employees all keep the calendar up to date (employee deletes need approval).
  return CREATORS.includes(user.role);
}

function dayRange(from: Date, to: Date) {
  // Date-only columns: include any day touching the window.
  return { gte: new Date(from.toISOString().slice(0, 10)), lte: new Date(to.toISOString().slice(0, 10)) };
}

export async function listRange(user: AuthUser, query: RangeQuery): Promise<CalendarItem[]> {
  const from = new Date(query.from);
  const to = new Date(query.to);
  const want = (s: CalendarItem["source"]) => !query.sources || query.sources.includes(s);
  const mine = query.mine === "true";
  const items: CalendarItem[] = [];

  if (want("EVENT")) {
    const events = await prisma.calendarEvent.findMany({
      where: {
        AND: [
          // Non-repeating events overlapping the window, or repeating series that started before it ends.
          { OR: [{ recurrence: "NONE", startAt: { lt: to }, endAt: { gte: new Date(from.getTime() - 86_400_000) } }, { recurrence: { not: "NONE" }, startAt: { lt: to } }] },
          query.clientId ? { clientId: query.clientId } : {},
          query.types ? { eventType: { in: query.types } } : {},
          mine ? { OR: [{ createdById: user.id }, ...(user.employeeId ? [{ attendees: { some: { employeeId: user.employeeId } } }] : [])] } : {},
        ],
      },
      include: eventInclude,
    });
    for (const e of events) {
      for (const occ of expandOccurrences(e, from, to)) {
        items.push({
          id: e.recurrence === "NONE" ? e.id : `${e.id}:${occ.dateKey}`,
          source: "EVENT",
          refId: e.id,
          title: e.title,
          start: occ.start.toISOString(),
          end: occ.end.toISOString(),
          allDay: e.allDay,
          eventType: e.eventType,
          color: e.color,
          client: e.client,
          recurring: e.recurrence !== "NONE",
          occurrenceDate: occ.dateKey,
          canEdit: canEdit(user, e),
          location: e.location,
          meta: e.attendees.length ? `${e.attendees.length} guest${e.attendees.length > 1 ? "s" : ""}` : null,
          href: null,
        });
      }
    }
  }

  // Task due dates: employees only see their own; accountants have no tasks.
  if (want("TASK") && !query.types && (MANAGERS.includes(user.role) || (user.role === "EMPLOYEE" && user.employeeId))) {
    const tasks = await prisma.task.findMany({
      where: {
        dueDate: dayRange(from, to),
        status: { not: "CANCELLED" },
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(user.role === "EMPLOYEE" || mine ? { assigneeId: user.employeeId ?? "none" } : {}),
      },
      include: { client: { select: { id: true, name: true } }, assignee: { select: { fullName: true } } },
    });
    for (const t of tasks) {
      items.push({
        id: `task:${t.id}`,
        source: "TASK",
        refId: t.id,
        title: `Due: ${t.title}`,
        start: t.dueDate!.toISOString(),
        end: t.dueDate!.toISOString(),
        allDay: true,
        eventType: null,
        color: null,
        client: t.client,
        recurring: false,
        occurrenceDate: null,
        canEdit: false,
        location: null,
        meta: `${t.assignee.fullName} · ${t.status.replace(/_/g, " ").toLowerCase()}`,
        href: "/tasks",
      });
    }
  }

  if (want("CREATIVE") && !query.types && !mine) {
    const creatives = await prisma.creativeAsset.findMany({
      where: { publishDate: dayRange(from, to), status: { not: "ARCHIVED" }, ...(query.clientId ? { clientId: query.clientId } : {}) },
      include: { client: { select: { id: true, name: true } } },
    });
    for (const c of creatives) {
      items.push({
        id: `creative:${c.id}`,
        source: "CREATIVE",
        refId: c.id,
        title: `Publish: ${c.title}`,
        start: c.publishDate!.toISOString(),
        end: c.publishDate!.toISOString(),
        allDay: true,
        eventType: null,
        color: null,
        client: c.client,
        recurring: false,
        occurrenceDate: null,
        canEdit: false,
        location: null,
        meta: `${c.contentType.toLowerCase()} · ${c.platform.toLowerCase()} · ${c.status.toLowerCase()}`,
        href: `/clients/${c.clientId}`,
      });
    }
  }

  if (want("AD_CAMPAIGN") && !query.types && !mine) {
    const campaigns = await prisma.adCampaign.findMany({
      where: {
        status: { not: "CANCELLED" },
        startDate: { lte: dayRange(from, to).lte },
        OR: [{ endDate: null }, { endDate: { gte: dayRange(from, to).gte } }],
        ...(query.clientId ? { clientId: query.clientId } : {}),
      },
      include: { client: { select: { id: true, name: true } } },
    });
    for (const c of campaigns) {
      // Open-ended campaigns are drawn up to the end of the visible window.
      const end = c.endDate ?? new Date(to.toISOString().slice(0, 10));
      items.push({
        id: `ad:${c.id}`,
        source: "AD_CAMPAIGN",
        refId: c.id,
        title: `Ad: ${c.name}`,
        start: c.startDate.toISOString(),
        end: end.toISOString(),
        allDay: true,
        eventType: null,
        color: null,
        client: c.client,
        recurring: false,
        occurrenceDate: null,
        canEdit: false,
        location: null,
        meta: `${c.campaignType.replace(/_/g, " ").toLowerCase()} · spend ${c.spend.toFixed(2)}`,
        href: "/ads",
      });
    }
  }

  return items.sort((a, b) => a.start.localeCompare(b.start));
}

function shapeEvent(user: AuthUser, e: EventRow) {
  return { ...e, attendees: e.attendees.map((a) => a.employee), canEdit: canEdit(user, e) };
}

export async function getEvent(user: AuthUser, id: string) {
  const event = await prisma.calendarEvent.findUnique({ where: { id }, include: eventInclude });
  if (!event) throw AppError.notFound("Event");
  return shapeEvent(user, event);
}

async function assertRefs(input: EventInput) {
  if (input.clientId && !(await prisma.client.findUnique({ where: { id: input.clientId } }))) throw AppError.badRequest("Client not found");
  if (input.attendeeIds.length) {
    const count = await prisma.employee.count({ where: { id: { in: input.attendeeIds } } });
    if (count !== new Set(input.attendeeIds).size) throw AppError.badRequest("One or more guests were not found");
  }
}

function eventData(input: EventInput) {
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    eventType: input.eventType,
    color: input.color,
    clientId: input.clientId,
    allDay: input.allDay,
    startAt: input.startAt,
    endAt: input.endAt,
    recurrence: input.recurrence,
    recurrenceInterval: input.recurrenceInterval,
    recurrenceUntil: input.recurrence === "NONE" ? null : input.recurrenceUntil,
  };
}

function describeWhen(input: { allDay: boolean; startAt: Date; recurrence: string }) {
  const when = input.allDay ? input.startAt.toISOString().slice(0, 10) : input.startAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return input.recurrence === "NONE" ? when : `${when}, repeats ${input.recurrence.toLowerCase()}`;
}

export async function createEvent(req: Request, user: AuthUser, input: EventInput) {
  if (!CREATORS.includes(user.role)) throw AppError.forbidden("Your role cannot add calendar events");
  await assertRefs(input);
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.calendarEvent.create({
      data: { ...eventData(input), createdById: user.id, attendees: { create: [...new Set(input.attendeeIds)].map((employeeId) => ({ employeeId })) } },
    });
    await audit(req, { action: "CREATE", entityType: "CalendarEvent", entityId: created.id, clientId: input.clientId, summary: `Calendar event "${input.title}" added (${describeWhen(created)})` }, tx);
    return created;
  });
  return getEvent(user, event.id);
}

async function findEditable(user: AuthUser, id: string) {
  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event) throw AppError.notFound("Event");
  if (!canEdit(user, event)) throw AppError.forbidden("Only the person who created this event, an admin or a manager can change it");
  return event;
}

export async function updateEvent(req: Request, user: AuthUser, id: string, input: EventInput) {
  const before = await findEditable(user, id);
  await assertRefs(input);
  await prisma.$transaction(async (tx) => {
    await tx.calendarEventAttendee.deleteMany({ where: { eventId: id } });
    await tx.calendarEvent.update({
      where: { id },
      data: {
        ...eventData(input),
        // Changing the repeat pattern resets removed occurrences.
        ...(before.recurrence !== input.recurrence ? { excludedDates: [] } : {}),
        attendees: { create: [...new Set(input.attendeeIds)].map((employeeId) => ({ employeeId })) },
      },
    });
    await audit(req, { action: "UPDATE", entityType: "CalendarEvent", entityId: id, clientId: input.clientId, summary: `Calendar event "${input.title}" updated (${describeWhen(input)})` }, tx);
  });
  return getEvent(user, id);
}

/** Drag-and-drop move. Repeating events must be edited as a series. */
export async function moveEvent(req: Request, user: AuthUser, id: string, move: { start: string; end: string; allDay: boolean }) {
  const before = await findEditable(user, id);
  if (before.recurrence !== "NONE") throw AppError.badRequest("Repeating events can't be dragged. Open the event to change the whole series.");
  const toUtcDay = (v: string) => new Date(`${v.slice(0, 10)}T00:00:00.000Z`);
  const startAt = move.allDay ? toUtcDay(move.start) : new Date(move.start);
  const endAt = move.allDay ? toUtcDay(move.end) : new Date(move.end);
  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({ where: { id }, data: { startAt, endAt, allDay: move.allDay } });
    await audit(
      req,
      { action: "MOVE", entityType: "CalendarEvent", entityId: id, clientId: before.clientId, summary: `Calendar event "${before.title}" moved to ${describeWhen({ allDay: move.allDay, startAt, recurrence: "NONE" })}` },
      tx,
    );
  });
  return getEvent(user, id);
}

/** Deletes the whole event, or only one occurrence of a repeating event. */
export async function deleteEvent(req: Request, user: AuthUser, id: string, occurrence?: string) {
  const event = await findEditable(user, id);
  if (occurrence && event.recurrence !== "NONE") {
    await prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({ where: { id }, data: { excludedDates: { push: occurrence } } });
      await audit(req, { action: "DELETE_OCCURRENCE", entityType: "CalendarEvent", entityId: id, clientId: event.clientId, summary: `Removed the ${occurrence} occurrence of "${event.title}"` }, tx);
    });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.delete({ where: { id } });
    await audit(req, { action: "DELETE", entityType: "CalendarEvent", entityId: id, clientId: event.clientId, summary: `Calendar event "${event.title}" deleted` }, tx);
  });
}
