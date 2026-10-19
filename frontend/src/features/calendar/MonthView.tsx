"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { isSameDay, monthGrid, occursOn, type PlacedItem, ymd } from "./calendarUtils";
import { EventChip } from "./EventChip";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 3;

function DayCell({
  day,
  inMonth,
  items,
  onCreate,
  onOpen,
  onShowDay,
}: {
  day: Date;
  inMonth: boolean;
  items: PlacedItem[];
  onCreate: (day: Date) => void;
  onOpen: (item: PlacedItem) => void;
  onShowDay: (day: Date) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day|${ymd(day)}` });
  const today = isSameDay(day, new Date());
  const hidden = items.length - MAX_VISIBLE;

  return (
    <div
      ref={setNodeRef}
      onClick={() => onCreate(day)}
      className={cn("group min-h-[112px] cursor-pointer border-r border-b border-line p-1 transition-colors", !inMonth && "bg-page/70", isOver && "bg-accent-soft", "hover:bg-page/50")}
    >
      <div className="mb-1 flex justify-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShowDay(day);
          }}
          className={cn(
            "flex size-7 items-center justify-center rounded-full text-xs font-medium",
            today ? "bg-accent text-white" : inMonth ? "text-ink hover:bg-slate-100" : "text-slate-400 hover:bg-slate-100",
          )}
          aria-label={`Open ${day.toDateString()}`}
        >
          {day.getDate() === 1 ? day.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : day.getDate()}
        </button>
      </div>
      <div className="space-y-0.5">
        {items.slice(0, hidden > 0 ? MAX_VISIBLE - 1 : MAX_VISIBLE).map((item) => (
          <EventChip key={`${item.id}-${ymd(day)}`} item={item} onOpen={onOpen} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShowDay(day);
            }}
            className="w-full rounded px-1.5 text-left text-[12px] font-medium text-slate-600 hover:bg-slate-100"
          >
            {hidden + 1} more
          </button>
        )}
      </div>
    </div>
  );
}

export function MonthView({
  cursor,
  items,
  onCreate,
  onOpen,
  onShowDay,
}: {
  cursor: Date;
  items: PlacedItem[];
  onCreate: (day: Date) => void;
  onOpen: (item: PlacedItem) => void;
  onShowDay: (day: Date) => void;
}) {
  const days = monthGrid(cursor);
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold tracking-wider text-muted uppercase">
            {d}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 border-l border-line">
        {days.map((day) => {
          const dayItems = items
            .filter((i) => occursOn(i, day))
            .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startDate.getTime() - b.startDate.getTime());
          return <DayCell key={ymd(day)} day={day} inMonth={day.getMonth() === cursor.getMonth()} items={dayItems} onCreate={onCreate} onOpen={onOpen} onShowDay={onShowDay} />;
        })}
      </div>
    </div>
  );
}
