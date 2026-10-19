/** Local-time date helpers for the calendar (weeks start on Sunday, like Google Calendar). */

export type CalendarView = "month" | "week" | "day" | "agenda";
export type Source = "EVENT" | "TASK" | "CREATIVE" | "AD_CAMPAIGN";

export interface CalendarItem {
  id: string;
  source: Source;
  refId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  eventType: string | null;
  color: string | null;
  client: { id: string; name: string } | null;
  recurring: boolean;
  occurrenceDate: string | null;
  canEdit: boolean;
  location: string | null;
  meta: string | null;
  href: string | null;
}

/** Item with local Date objects. All-day items cover whole local days (end inclusive). */
export interface PlacedItem extends CalendarItem {
  startDate: Date;
  endDate: Date;
}

export const EVENT_TYPES = [
  { value: "POST_SCHEDULE", label: "Posting date", color: "#16a34a" },
  { value: "DESIGN_DEADLINE", label: "Design deadline", color: "#dc2626" },
  { value: "CLIENT_SUBMISSION", label: "Send to client", color: "#7c3aed" },
  { value: "SHOOT", label: "Shoot", color: "#2563eb" },
  { value: "MEETING", label: "Meeting", color: "#0891b2" },
  { value: "CAMPAIGN_LAUNCH", label: "Campaign launch", color: "#ea580c" },
  { value: "FESTIVAL", label: "Festival / occasion", color: "#db2777" },
  { value: "OTHER", label: "Other", color: "#64748b" },
] as const;

export const SOURCES: { value: Source; label: string; color: string }[] = [
  { value: "EVENT", label: "Events", color: "#f97316" },
  { value: "TASK", label: "Task deadlines", color: "#475569" },
  { value: "CREATIVE", label: "Creative publish dates", color: "#0d9488" },
  { value: "AD_CAMPAIGN", label: "Ad campaigns", color: "#4f46e5" },
];

export const COLOR_CHOICES = ["#f97316", "#dc2626", "#db2777", "#7c3aed", "#2563eb", "#0891b2", "#16a34a", "#ca8a04", "#64748b"];

export function colorOf(item: Pick<CalendarItem, "color" | "eventType" | "source">) {
  if (item.color) return item.color;
  if (item.source !== "EVENT") return SOURCES.find((s) => s.value === item.source)!.color;
  return EVENT_TYPES.find((t) => t.value === item.eventType)?.color ?? "#64748b";
}

export function typeLabel(value: string | null) {
  return EVENT_TYPES.find((t) => t.value === value)?.label ?? "Event";
}

// ---------------------------------------------------------------------------
// Date maths (local time)
// ---------------------------------------------------------------------------

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const pad = (n: number) => String(n).padStart(2, "0");
/** Local YYYY-MM-DD. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Value for <input type="datetime-local">. */
export const localDateTimeInput = (d: Date) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Six-week grid for a month view. */
export function monthGrid(cursor: Date) {
  const first = startOfWeek(startOfMonth(cursor));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function visibleRange(view: CalendarView, cursor: Date): { from: Date; to: Date } {
  if (view === "month") {
    const grid = monthGrid(cursor);
    return { from: grid[0], to: addDays(grid[41], 1) };
  }
  if (view === "week") {
    const from = startOfWeek(cursor);
    return { from, to: addDays(from, 7) };
  }
  if (view === "day") {
    const from = startOfDay(cursor);
    return { from, to: addDays(from, 1) };
  }
  const from = startOfDay(cursor);
  return { from, to: addDays(from, 30) };
}

/** Converts API items to local dates. All-day dates are stored as UTC midnight and shown as that calendar day. */
export function place(item: CalendarItem): PlacedItem {
  if (item.allDay) {
    const s = new Date(item.start);
    const e = new Date(item.end);
    return { ...item, startDate: new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()), endDate: new Date(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()) };
  }
  return { ...item, startDate: new Date(item.start), endDate: new Date(item.end) };
}

/** Does the item appear on this local day? */
export function occursOn(item: PlacedItem, day: Date) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  if (item.allDay) return item.startDate <= dayStart && item.endDate >= dayStart;
  // Timed: any overlap with the day; an event ending exactly at midnight does not spill into the next day.
  if (item.startDate.getTime() === item.endDate.getTime()) return item.startDate >= dayStart && item.startDate < dayEnd;
  return item.startDate < dayEnd && item.endDate > dayStart;
}

export function formatTime(d: Date) {
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
}

export function formatRangeTitle(view: CalendarView, cursor: Date) {
  if (view === "month") return cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  if (view === "day") return cursor.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "agenda") return `${cursor.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${addDays(cursor, 29).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  const start = startOfWeek(cursor);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? start.toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : `${start.toLocaleDateString("en-IN", { month: "short" })} – ${end.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`;
}

export function whenLabel(item: PlacedItem) {
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
  if (item.allDay) {
    const s = item.startDate.toLocaleDateString("en-IN", dateOpts);
    return isSameDay(item.startDate, item.endDate) ? s : `${s} – ${item.endDate.toLocaleDateString("en-IN", dateOpts)}`;
  }
  const s = item.startDate.toLocaleDateString("en-IN", dateOpts);
  return isSameDay(item.startDate, item.endDate)
    ? `${s} · ${formatTime(item.startDate)} – ${formatTime(item.endDate)}`
    : `${s}, ${formatTime(item.startDate)} – ${item.endDate.toLocaleDateString("en-IN", dateOpts)}, ${formatTime(item.endDate)}`;
}
