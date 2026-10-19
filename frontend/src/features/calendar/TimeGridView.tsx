"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Repeat } from "@/components/ui/icons";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { addDays, colorOf, formatTime, isSameDay, occursOn, type PlacedItem, startOfDay, ymd } from "./calendarUtils";
import { canDrag, EventChip } from "./EventChip";

export const HOUR_PX = 48;
const SLOT_MIN = 30;

function Slot({ day, minutes, onCreate }: { day: Date; minutes: number; onCreate: (start: Date) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot|${ymd(day)}|${minutes}` });
  return (
    <div
      ref={setNodeRef}
      onClick={() => onCreate(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes))}
      className={cn("cursor-pointer border-b border-line/60", minutes % 60 === 30 && "border-dashed border-line/40", isOver ? "bg-accent-soft" : "hover:bg-page/60")}
      style={{ height: HOUR_PX / 2 }}
    />
  );
}

function AllDayCell({ day, items, onCreate, onOpen }: { day: Date; items: PlacedItem[]; onCreate: (day: Date) => void; onOpen: (item: PlacedItem) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day|${ymd(day)}` });
  return (
    <div ref={setNodeRef} onClick={() => onCreate(day)} className={cn("min-h-8 cursor-pointer space-y-0.5 border-r border-line p-1", isOver && "bg-accent-soft")}>
      {items.map((item) => (
        <EventChip key={`${item.id}-${ymd(day)}`} item={item} onOpen={onOpen} compact />
      ))}
    </div>
  );
}

/** Greedy column layout so overlapping events sit side by side. */
function layout(items: PlacedItem[]) {
  const sorted = [...items].sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || b.endDate.getTime() - a.endDate.getTime());
  const placed: { item: PlacedItem; col: number; cols: number }[] = [];
  let group: { item: PlacedItem; col: number }[] = [];
  let groupEnd = 0;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    for (const g of group) placed.push({ ...g, cols });
    group = [];
  };
  for (const item of sorted) {
    if (group.length && item.startDate.getTime() >= groupEnd) flush();
    const taken = new Set(group.filter((g) => g.item.endDate > item.startDate).map((g) => g.col));
    let col = 0;
    while (taken.has(col)) col++;
    group.push({ item, col });
    groupEnd = Math.max(groupEnd, item.endDate.getTime());
  }
  flush();
  return placed;
}

function TimedEvent({ item, day, col, cols, onOpen }: { item: PlacedItem; day: Date; col: number; cols: number; onOpen: (item: PlacedItem) => void }) {
  const draggable = canDrag(item);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `timed|${item.id}|${ymd(day)}`, data: { item }, disabled: !draggable });
  const dayStart = startOfDay(day);
  const start = Math.max(0, (item.startDate.getTime() - dayStart.getTime()) / 60000);
  const end = Math.min(24 * 60, (item.endDate.getTime() - dayStart.getTime()) / 60000);
  const height = Math.max(((end - start) / 60) * HOUR_PX, 20);
  const color = colorOf(item);

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...(draggable ? { ...listeners, ...attributes } : {})}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      className={cn(
        "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight text-ink shadow-sm",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      style={{
        top: (start / 60) * HOUR_PX,
        height,
        left: `calc(${(col / cols) * 100}% + 2px)`,
        width: `calc(${100 / cols}% - 4px)`,
        backgroundColor: `${color}22`,
        borderLeftColor: color,
      }}
      title={item.title}
    >
      <span className="flex items-center gap-1 font-semibold">
        <span className="truncate">{item.title}</span>
        {item.recurring && <Repeat className="size-3 shrink-0" aria-label="Repeats" />}
      </span>
      {height > 28 && (
        <span className="block truncate text-muted">
          {formatTime(item.startDate)} – {formatTime(item.endDate)}
          {item.client ? ` · ${item.client.name}` : ""}
        </span>
      )}
    </button>
  );
}

export function TimeGridView({
  days,
  items,
  onCreateTimed,
  onCreateAllDay,
  onOpen,
  onShowDay,
}: {
  days: Date[];
  items: PlacedItem[];
  onCreateTimed: (start: Date) => void;
  onCreateAllDay: (day: Date) => void;
  onOpen: (item: PlacedItem) => void;
  onShowDay: (day: Date) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Start scrolled to 8 am, like Google Calendar.
    if (scroller.current) scroller.current.scrollTop = 8 * HOUR_PX - 8;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;
  const allDayItems = items.filter((i) => i.allDay);
  const timedItems = items.filter((i) => !i.allDay);

  return (
    <div className="flex h-full flex-col">
      {/* Day headers */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
        <div className="flex items-end justify-end pr-2 pb-1 text-[10px] text-muted">GMT+5:30</div>
        {days.map((day) => {
          const today = isSameDay(day, new Date());
          return (
            <button key={ymd(day)} type="button" onClick={() => onShowDay(day)} className="flex flex-col items-center py-2 hover:bg-page/60">
              <span className={cn("text-[11px] font-semibold tracking-wider uppercase", today ? "text-accent" : "text-muted")}>{day.toLocaleDateString("en-IN", { weekday: "short" })}</span>
              <span className={cn("mt-0.5 flex size-9 items-center justify-center rounded-full text-xl", today ? "bg-accent text-white" : "text-ink")}>{day.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* All-day row */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
        <div className="border-r border-line pt-1.5 pr-2 text-right text-[10px] text-muted">all-day</div>
        {days.map((day) => (
          <AllDayCell key={ymd(day)} day={day} items={allDayItems.filter((i) => occursOn(i, day))} onCreate={onCreateAllDay} onOpen={onOpen} />
        ))}
      </div>

      {/* Hour grid */}
      <div ref={scroller} className="relative flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative border-r border-line pr-2 text-right text-[10px] text-muted" style={{ height: HOUR_PX }}>
                {h > 0 && <span className="relative -top-2">{formatTime(new Date(2000, 0, 1, h))}</span>}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const dayItems = layout(timedItems.filter((i) => occursOn(i, day)));
            const showNow = isSameDay(day, now);
            const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX;
            return (
              <div key={ymd(day)} className="relative border-r border-line">
                {Array.from({ length: (24 * 60) / SLOT_MIN }, (_, i) => (
                  <Slot key={i} day={day} minutes={i * SLOT_MIN} onCreate={onCreateTimed} />
                ))}
                {dayItems.map(({ item, col, cols: total }) => (
                  <TimedEvent key={`${item.id}-${ymd(day)}`} item={item} day={day} col={col} cols={total} onOpen={onOpen} />
                ))}
                {showNow && (
                  <div className="pointer-events-none absolute right-0 left-0 z-10 flex items-center" style={{ top: nowTop }} aria-hidden>
                    <span className="-ml-1.5 size-3 rounded-full bg-red-500" />
                    <span className="h-0.5 flex-1 bg-red-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function weekDays(cursor: Date) {
  const start = addDays(startOfDay(cursor), -cursor.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
