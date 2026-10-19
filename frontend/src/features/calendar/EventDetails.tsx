"use client";

import { Briefcase, CalendarDays, ExternalLink, MapPin, Pencil, Repeat, Trash2, Users } from "@/components/ui/icons";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api, approvalMessage, errorMessage, isApprovalRequested } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { colorOf, type PlacedItem, SOURCES, typeLabel, whenLabel } from "./calendarUtils";

export interface CalendarEventDetail {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  eventType: string;
  color: string | null;
  clientId: string | null;
  client: { id: string; name: string } | null;
  allDay: boolean;
  startAt: string;
  endAt: string;
  recurrence: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  recurrenceInterval: number;
  recurrenceUntil: string | null;
  createdBy: { id: string; name: string } | null;
  attendees: { id: string; fullName: string; employeeCode: string }[];
  canEdit: boolean;
}

const REPEAT_LABEL: Record<string, string> = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" };

/** Google-style event card: details, with edit / delete for people allowed to change it. */
export function EventDetails({ item, onClose, onEdit, onChanged }: { item: PlacedItem; onClose: () => void; onEdit: (event: CalendarEventDetail) => void; onChanged: () => void }) {
  const { notify } = useToast();
  const detail = useAsync(() => (item.source === "EVENT" ? api.get<CalendarEventDetail>(`/calendar/events/${item.refId}`) : Promise.resolve(null)), [item.refId]);
  const [askScope, setAskScope] = useState(false);
  const [busy, setBusy] = useState(false);
  const event = detail.data;

  async function remove(onlyThis: boolean) {
    setBusy(true);
    try {
      const result = await api.delete(onlyThis ? `/calendar/events/${item.refId}?occurrence=${item.occurrenceDate}` : `/calendar/events/${item.refId}`);
      notify(isApprovalRequested(result) ? approvalMessage(result) : onlyThis ? "This occurrence was deleted" : "Event deleted");
      onChanged();
      onClose();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  const sourceLabel = item.source === "EVENT" ? typeLabel(item.eventType) : SOURCES.find((s) => s.value === item.source)?.label;

  return (
    <Modal
      open
      title={item.title}
      onClose={onClose}
      footer={
        item.source === "EVENT" && item.canEdit && event ? (
          askScope ? (
            <>
              <span className="mr-auto text-sm text-muted">Delete repeating event:</span>
              <Button variant="secondary" size="sm" loading={busy} onClick={() => remove(true)}>
                This event
              </Button>
              <Button variant="danger" size="sm" loading={busy} onClick={() => remove(false)}>
                All events
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="mr-auto" onClick={() => (item.recurring ? setAskScope(true) : remove(false))} loading={busy}>
                <Trash2 className="size-4" /> Delete
              </Button>
              <Button variant="secondary" onClick={() => onEdit(event)}>
                <Pencil className="size-4" /> Edit
              </Button>
            </>
          )
        ) : item.href ? (
          <Link href={item.href}>
            <Button variant="secondary">
              <ExternalLink className="size-4" /> Open
            </Button>
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-3 text-sm">
        <p className="flex items-center gap-2">
          <span className="size-3 rounded" style={{ backgroundColor: colorOf(item) }} aria-hidden />
          <span className="font-medium">{sourceLabel}</span>
        </p>
        <p className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>{whenLabel(item)}</span>
        </p>
        {event && event.recurrence !== "NONE" && (
          <p className="flex items-start gap-2">
            <Repeat className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>
              Repeats every {event.recurrenceInterval > 1 ? `${event.recurrenceInterval} ` : ""}
              {REPEAT_LABEL[event.recurrence]}
              {event.recurrenceInterval > 1 ? "s" : ""}
              {event.recurrenceUntil ? ` until ${new Date(event.recurrenceUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : ""}
            </span>
          </p>
        )}
        {item.client && (
          <p className="flex items-start gap-2">
            <Briefcase className="mt-0.5 size-4 shrink-0 text-muted" />
            <Link href={`/clients/${item.client.id}`} className="text-accent hover:underline">
              {item.client.name}
            </Link>
          </p>
        )}
        {item.location && (
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>{item.location}</span>
          </p>
        )}
        {item.source !== "EVENT" && item.meta && <p className="text-muted capitalize">{item.meta}</p>}
        {item.source === "EVENT" && !event && <Spinner className="py-3" />}
        {event && event.attendees.length > 0 && (
          <div className="flex items-start gap-2">
            <Users className="mt-0.5 size-4 shrink-0 text-muted" />
            <ul>
              {event.attendees.map((a) => (
                <li key={a.id}>{a.fullName}</li>
              ))}
            </ul>
          </div>
        )}
        {event?.description && <p className="rounded-lg bg-page px-3 py-2 whitespace-pre-line">{event.description}</p>}
        {event?.createdBy && <p className="text-xs text-muted">Created by {event.createdBy.name}</p>}
        {item.source === "EVENT" && !item.canEdit && <p className="text-xs text-muted">Only admins, managers and employees can change calendar events.</p>}
      </div>
    </Modal>
  );
}
