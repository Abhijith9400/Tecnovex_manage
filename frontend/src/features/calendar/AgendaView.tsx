"use client";

import { CalendarX2, Repeat } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { addDays, colorOf, formatTime, isSameDay, occursOn, type PlacedItem, startOfDay, ymd } from "./calendarUtils";

/** Schedule list (Google's "Schedule" view): the next 30 days, grouped by day. */
export function AgendaView({ from, items, onOpen }: { from: Date; items: PlacedItem[]; onOpen: (item: PlacedItem) => void }) {
  const days = Array.from({ length: 30 }, (_, i) => addDays(startOfDay(from), i))
    .map((day) => ({
      day,
      items: items.filter((i) => occursOn(i, day)).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startDate.getTime() - b.startDate.getTime()),
    }))
    .filter((d) => d.items.length > 0);

  if (days.length === 0) return <EmptyState icon={CalendarX2} title="Nothing scheduled in the next 30 days" description="Click Create to add an event." />;

  return (
    <div className="divide-y divide-line overflow-y-auto">
      {days.map(({ day, items: dayItems }) => {
        const today = isSameDay(day, new Date());
        return (
          <div key={ymd(day)} className="flex gap-4 px-4 py-3">
            <div className="w-24 shrink-0">
              <span className={cn("mr-2 inline-flex size-8 items-center justify-center rounded-full text-lg", today ? "bg-accent text-white" : "text-ink")}>{day.getDate()}</span>
              <span className={cn("text-xs font-medium uppercase", today ? "text-accent" : "text-muted")}>{day.toLocaleDateString("en-IN", { month: "short", weekday: "short" })}</span>
            </div>
            <ul className="min-w-0 flex-1 space-y-1">
              {dayItems.map((item) => (
                <li key={`${item.id}-${ymd(day)}`}>
                  <button type="button" onClick={() => onOpen(item)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-page">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(item) }} aria-hidden />
                    <span className="w-28 shrink-0 text-xs text-muted">{item.allDay ? "All day" : `${formatTime(item.startDate)} – ${formatTime(item.endDate)}`}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{item.title}</span>
                    {item.recurring && <Repeat className="size-3.5 shrink-0 text-muted" aria-label="Repeats" />}
                    {item.client && <span className="hidden shrink-0 truncate text-xs text-muted sm:block">{item.client.name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
