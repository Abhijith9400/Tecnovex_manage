"use client";

import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Plus } from "@/components/ui/icons";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Feedback";
import { Select } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, errorMessage } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useClientOptions } from "@/lib/options";
import { cn } from "@/lib/utils";
import { AgendaView } from "./AgendaView";
import {
  addDays,
  addMonths,
  type CalendarItem,
  type CalendarView,
  EVENT_TYPES,
  formatRangeTitle,
  type PlacedItem,
  place,
  SOURCES,
  type Source,
  startOfDay,
  visibleRange,
} from "./calendarUtils";
import { type CalendarEventDetail, EventDetails } from "./EventDetails";
import { allDayDraft, defaultDraft, type EventDraft, EventForm, timedDraft } from "./EventForm";
import { MiniMonth } from "./MiniMonth";
import { MonthView } from "./MonthView";
import { TimeGridView, weekDays } from "./TimeGridView";

const VIEWS: { value: CalendarView; label: string; key: string }[] = [
  { value: "day", label: "Day", key: "d" },
  { value: "week", label: "Week", key: "w" },
  { value: "month", label: "Month", key: "m" },
  { value: "agenda", label: "Schedule", key: "a" },
];

const parseDay = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Google Calendar–style team calendar. Pass `clientId` to lock it to one client (client page tab).
 * Drag events to move them; click an empty day or time to create one.
 */
export function CalendarApp({ clientId }: { clientId?: string }) {
  const { hasRole } = useAuth();
  const { notify } = useToast();
  const canCreate = hasRole(["ADMIN", "MANAGER", "EMPLOYEE"]);
  const clients = useClientOptions(true);

  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [sources, setSources] = useState<Source[]>(SOURCES.map((s) => s.value));
  const [types, setTypes] = useState<string[]>(EVENT_TYPES.map((t) => t.value));
  const [clientFilter, setClientFilter] = useState("");
  const [mine, setMine] = useState(false);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [editing, setEditing] = useState<CalendarEventDetail | null>(null);
  const [selected, setSelected] = useState<PlacedItem | null>(null);

  const range = visibleRange(view, cursor);
  const effectiveClient = clientId ?? clientFilter;
  const allTypes = types.length === EVENT_TYPES.length;
  const query = {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    clientId: effectiveClient,
    sources: allTypes ? sources.join(",") : "EVENT",
    types: allTypes ? undefined : types.join(","),
    mine: mine ? "true" : undefined,
  };
  const data = useAsync(() => (sources.length === 0 || types.length === 0 ? Promise.resolve([] as CalendarItem[]) : api.get<CalendarItem[]>("/calendar", query)), [JSON.stringify(query), sources.length, types.length]);
  const items = useMemo(() => (data.data ?? []).filter((i) => sources.includes(i.source)).map(place), [data.data, sources]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function step(direction: 1 | -1) {
    setCursor((c) => (view === "month" ? addMonths(c, direction) : addDays(c, direction * (view === "week" ? 7 : view === "day" ? 1 : 30))));
  }

  // Keyboard shortcuts like Google Calendar: t (today), d/w/m/a (views), j/k or n/p (next/previous), c (create).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      const v = VIEWS.find((x) => x.key === k);
      if (v) setView(v.value);
      else if (k === "t") setCursor(startOfDay(new Date()));
      else if (k === "j" || k === "n") step(1);
      else if (k === "k" || k === "p") step(-1);
      else if (k === "c" && canCreate) setDraft({ ...defaultDraft(cursor), clientId });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function onDragEnd(event: DragEndEvent) {
    const item = event.active.data.current?.item as PlacedItem | undefined;
    const over = event.over?.id ? String(event.over.id) : null;
    if (!item || !over) return;
    const [kind, day, minutes] = over.split("|");
    const target = parseDay(day);
    let start: Date;
    let end: Date;
    let allDay = item.allDay;

    if (kind === "day") {
      const shift = Math.round((target.getTime() - startOfDay(item.startDate).getTime()) / 86_400_000);
      if (shift === 0) return;
      start = addDays(item.startDate, shift);
      end = addDays(item.endDate, shift);
    } else {
      const slotStart = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, Number(minutes));
      const duration = item.allDay ? 3_600_000 : item.endDate.getTime() - item.startDate.getTime();
      if (!item.allDay && slotStart.getTime() === item.startDate.getTime()) return;
      start = slotStart;
      end = new Date(slotStart.getTime() + duration);
      allDay = false;
    }

    const body = allDay
      ? { allDay: true, start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`, end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}` }
      : { allDay: false, start: start.toISOString(), end: end.toISOString() };
    try {
      await api.patch(`/calendar/events/${item.refId}/move`, body);
      notify(`"${item.title}" moved`);
      data.reload();
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }

  const days = view === "week" ? weekDays(cursor) : [startOfDay(cursor)];
  const openDay = (day: Date) => {
    setCursor(startOfDay(day));
    setView("day");
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Sidebar */}
      <aside className="space-y-5 lg:w-60 lg:shrink-0">
        {canCreate && (
          <Button className="h-12 rounded-2xl px-5 text-base shadow-md" onClick={() => setDraft({ ...defaultDraft(cursor), clientId })}>
            <Plus className="size-5" /> Create
          </Button>
        )}
        <Card className="p-3">
          <MiniMonth key={`${cursor.getFullYear()}-${cursor.getMonth()}`} selected={cursor} onSelect={(d) => setCursor(startOfDay(d))} />
        </Card>
        {!clientId && (
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">Client</p>
            <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Filter by client" className="h-9">
              <option value="">All clients</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">My calendars</p>
          <ul className="space-y-1">
            {SOURCES.map((s) => (
              <li key={s.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-page">
                  <input
                    type="checkbox"
                    checked={sources.includes(s.value)}
                    onChange={() => setSources((list) => (list.includes(s.value) ? list.filter((x) => x !== s.value) : [...list, s.value]))}
                    className="size-4"
                    style={{ accentColor: s.color }}
                  />
                  {s.label}
                </label>
              </li>
            ))}
            <li>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-page">
                <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="size-4 accent-accent" />
                Only my events
              </label>
            </li>
          </ul>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">Event types</p>
            {!allTypes && (
              <button type="button" onClick={() => setTypes(EVENT_TYPES.map((t) => t.value))} className="text-xs text-accent hover:underline">
                Show all
              </button>
            )}
          </div>
          <ul className="space-y-1">
            {EVENT_TYPES.map((t) => (
              <li key={t.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-page">
                  <input
                    type="checkbox"
                    checked={types.includes(t.value)}
                    onChange={() => setTypes((list) => (list.includes(t.value) ? list.filter((x) => x !== t.value) : [...list, t.value]))}
                    className="size-4"
                    style={{ accentColor: t.color }}
                  />
                  {t.label}
                </label>
              </li>
            ))}
          </ul>
          {!allTypes && <p className="mt-1 px-1.5 text-[11px] text-muted">Linked items are hidden while filtering by event type.</p>}
        </div>
      </aside>

      {/* Main calendar */}
      <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <Button variant="secondary" size="sm" onClick={() => setCursor(startOfDay(new Date()))} title="Today (t)">
            Today
          </Button>
          <button type="button" onClick={() => step(-1)} className="rounded-full p-1.5 text-slate-600 hover:bg-page" aria-label="Previous" title="Previous (k)">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => step(1)} className="rounded-full p-1.5 text-slate-600 hover:bg-page" aria-label="Next" title="Next (j)">
            <ChevronRight className="size-5" />
          </button>
          <h2 className="mr-auto text-lg font-medium text-ink">{formatRangeTitle(view, cursor)}</h2>
          {data.loading && <span className="text-xs text-muted">Loading…</span>}
          <div className="flex rounded-lg border border-line p-0.5" role="tablist" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                role="tab"
                aria-selected={view === v.value}
                onClick={() => setView(v.value)}
                title={`${v.label} (${v.key})`}
                className={cn("rounded-md px-3 py-1 text-sm font-medium", view === v.value ? "bg-accent text-white" : "text-slate-600 hover:bg-page")}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        {data.error && (
          <div className="p-3">
            <Alert>{data.error}</Alert>
          </div>
        )}
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className={cn("min-h-0", view === "month" || view === "agenda" ? "flex-1" : "h-[calc(100vh-230px)] min-h-[520px]")}>
            {view === "month" && (
              <MonthView cursor={cursor} items={items} onCreate={(day) => canCreate && setDraft({ ...allDayDraft(day), clientId })} onOpen={setSelected} onShowDay={openDay} />
            )}
            {(view === "week" || view === "day") && (
              <TimeGridView
                days={days}
                items={items}
                onCreateTimed={(start) => canCreate && setDraft({ ...timedDraft(start), clientId })}
                onCreateAllDay={(day) => canCreate && setDraft({ ...allDayDraft(day), clientId })}
                onOpen={setSelected}
                onShowDay={openDay}
              />
            )}
            {view === "agenda" && <AgendaView from={cursor} items={items} onOpen={setSelected} />}
          </div>
        </DndContext>
      </Card>

      {selected && (
        <EventDetails
          item={selected}
          onClose={() => setSelected(null)}
          onEdit={(event) => {
            setSelected(null);
            setEditing(event);
          }}
          onChanged={data.reload}
        />
      )}
      {(draft || editing) && (
        <EventForm
          draft={draft ?? undefined}
          event={editing ?? undefined}
          onClose={() => {
            setDraft(null);
            setEditing(null);
          }}
          onSaved={() => {
            setDraft(null);
            setEditing(null);
            data.reload();
          }}
        />
      )}
    </div>
  );
}
