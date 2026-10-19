"use client";

import { Check } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import { useClientOptions } from "@/lib/options";
import { cn } from "@/lib/utils";
import { COLOR_CHOICES, EVENT_TYPES, pad, ymd } from "./calendarUtils";
import type { CalendarEventDetail } from "./EventDetails";

export interface EventDraft {
  allDay: boolean;
  start: Date;
  end: Date;
  clientId?: string;
}

const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const utcDay = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Create or edit a calendar event (Google-style "More options" form). */
export function EventForm({ draft, event, onClose, onSaved }: { draft?: EventDraft; event?: CalendarEventDetail; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const clients = useClientOptions();
  const employees = useAsync(() => api.get<{ id: string; fullName: string; employeeCode: string }[]>("/employees/options").catch(() => []), []);

  const start = event ? (event.allDay ? utcDay(event.startAt) : new Date(event.startAt)) : draft!.start;
  const end = event ? (event.allDay ? utcDay(event.endAt) : new Date(event.endAt)) : draft!.end;
  const form = useForm({
    title: event?.title ?? "",
    eventType: event?.eventType ?? "OTHER",
    clientId: event?.clientId ?? draft?.clientId ?? "",
    allDay: event?.allDay ?? draft!.allDay,
    startDate: ymd(start),
    startTime: timeOf(start),
    endDate: ymd(end),
    endTime: timeOf(end),
    recurrence: event?.recurrence ?? "NONE",
    recurrenceInterval: String(event?.recurrenceInterval ?? 1),
    recurrenceUntil: event?.recurrenceUntil ? event.recurrenceUntil.slice(0, 10) : "",
    location: event?.location ?? "",
    description: event?.description ?? "",
  });
  const [color, setColor] = useState(event?.color ?? "");
  const [guests, setGuests] = useState<string[]>(event?.attendees.map((a) => a.id) ?? []);
  const v = form.values;

  function toggleGuest(id: string) {
    setGuests((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title: v.title,
      eventType: v.eventType,
      clientId: v.clientId || null,
      allDay: v.allDay,
      start: v.allDay ? v.startDate : new Date(`${v.startDate}T${v.startTime}`).toISOString(),
      end: v.allDay ? v.endDate : new Date(`${v.endDate}T${v.endTime}`).toISOString(),
      recurrence: v.recurrence,
      recurrenceInterval: Number(v.recurrenceInterval || 1),
      recurrenceUntil: v.recurrence === "NONE" ? null : v.recurrenceUntil || null,
      location: v.location,
      description: v.description,
      color: color || null,
      attendeeIds: guests,
    };
    const saved = await form.submit(() => (event ? api.put(`/calendar/events/${event.id}`, body) : api.post("/calendar/events", body)));
    if (saved) {
      notify(event ? "Event updated" : "Event added");
      onSaved();
    }
  }

  const repeatUnit = { DAILY: "day(s)", WEEKLY: "week(s)", MONTHLY: "month(s)", YEARLY: "year(s)" }[String(v.recurrence)] ?? "";

  return (
    <Modal
      open
      size="lg"
      title={event ? "Edit event" : "New event"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="event-form" loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <input
          {...form.bind("title")}
          autoFocus
          placeholder="Add title, e.g. Diwali poster — final design due"
          aria-label="Title"
          className="w-full border-b-2 border-line bg-transparent pb-2 text-xl font-medium text-ink outline-none placeholder:text-slate-400 focus:border-accent"
        />
        {form.errors.title && <p className="-mt-2 text-xs text-danger">{form.errors.title}</p>}

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Event type">
          {EVENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={v.eventType === t.value}
              onClick={() => form.set("eventType", t.value)}
              className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", v.eventType === t.value ? "border-transparent text-white" : "border-line text-slate-600 hover:bg-page")}
              style={v.eventType === t.value ? { backgroundColor: t.color } : undefined}
            >
              {v.eventType !== t.value && <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />}
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border border-line p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={Boolean(v.allDay)} onChange={(e) => form.set("allDay", e.target.checked)} className="size-4 accent-accent" />
            All day
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex gap-2">
              <TextField form={form} name="startDate" label="Starts" type="date" className="flex-1" />
              {!v.allDay && <TextField form={form} name="startTime" label="Time" type="time" className="w-32" />}
            </div>
            <div className="flex gap-2">
              <TextField form={form} name="endDate" label="Ends" type="date" className="flex-1" />
              {!v.allDay && <TextField form={form} name="endTime" label="Time" type="time" className="w-32" />}
            </div>
          </div>
          {form.errors.end && <p className="text-xs text-danger">{form.errors.end}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              form={form}
              name="recurrence"
              label="Repeat"
              options={[
                { value: "NONE", label: "Does not repeat" },
                { value: "DAILY", label: "Daily" },
                { value: "WEEKLY", label: "Weekly" },
                { value: "MONTHLY", label: "Monthly" },
                { value: "YEARLY", label: "Yearly" },
              ]}
            />
            {v.recurrence !== "NONE" && (
              <>
                <TextField form={form} name="recurrenceInterval" label={`Every … ${repeatUnit}`} type="number" min="1" max="365" />
                <TextField form={form} name="recurrenceUntil" label="Until (optional)" type="date" />
              </>
            )}
          </div>
        </div>

        <FormGrid>
          <SelectField form={form} name="clientId" label="Client" placeholder="No client (internal)" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <TextField form={form} name="location" label="Location / link" placeholder="Office, studio, or a Meet/Zoom link" />
        </FormGrid>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Guests</p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {(employees.data ?? []).map((e) => {
              const on = guests.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggleGuest(e.id)}
                  aria-pressed={on}
                  className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", on ? "border-accent bg-accent-soft text-accent-hover" : "border-line text-slate-600 hover:bg-page")}
                >
                  {on && <Check className="size-3" />}
                  {e.fullName}
                </button>
              );
            })}
            {(employees.data ?? []).length === 0 && <span className="text-xs text-muted">No employees to invite.</span>}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Colour</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setColor("")} className={cn("rounded-full border px-2.5 py-1 text-xs", !color ? "border-accent bg-accent-soft" : "border-line")}>
              Event type colour
            </button>
            {COLOR_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                className={cn("flex size-6 items-center justify-center rounded-full ring-offset-2", color === c && "ring-2 ring-ink")}
                style={{ backgroundColor: c }}
              >
                {color === c && <Check className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
        </div>

        <TextAreaField form={form} name="description" label="Description" rows={3} />
      </form>
    </Modal>
  );
}

/** Default draft for "Create": next full hour, one hour long. */
export function defaultDraft(day = new Date()): EventDraft {
  const now = new Date();
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.min(now.getHours() + 1, 23), 0);
  return { allDay: false, start, end: new Date(start.getTime() + 3_600_000) };
}

export function allDayDraft(day: Date): EventDraft {
  return { allDay: true, start: day, end: day };
}

export function timedDraft(start: Date): EventDraft {
  return { allDay: false, start, end: new Date(start.getTime() + 3_600_000) };
}

