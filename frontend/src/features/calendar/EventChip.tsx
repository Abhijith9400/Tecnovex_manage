"use client";

import { useDraggable } from "@dnd-kit/core";
import { Repeat } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { colorOf, formatTime, type PlacedItem } from "./calendarUtils";

/** Draggable only for editable, non-repeating events; linked items (tasks, creatives, ads) are read-only. */
export function canDrag(item: PlacedItem) {
  return item.source === "EVENT" && item.canEdit && !item.recurring;
}

/** Compact one-line event used in month cells and the all-day row. */
export function EventChip({ item, onOpen, compact = false }: { item: PlacedItem; onOpen: (item: PlacedItem) => void; compact?: boolean }) {
  const draggable = canDrag(item);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip|${item.id}`, data: { item }, disabled: !draggable });
  const color = colorOf(item);
  const solid = item.allDay || item.source !== "EVENT";

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...(draggable ? { ...listeners, ...attributes } : {})}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      title={item.title}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded px-1.5 text-left text-[12px] leading-5",
        solid ? "font-medium text-white" : "text-ink hover:bg-page",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-40",
        compact && "text-[11px]",
      )}
      style={solid ? { backgroundColor: color } : undefined}
    >
      {!solid && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
      {!item.allDay && <span className={cn("shrink-0", solid ? "text-white/90" : "text-muted")}>{formatTime(item.startDate)}</span>}
      <span className="truncate">{item.title}</span>
      {item.recurring && <Repeat className="ml-auto size-3 shrink-0 opacity-80" aria-label="Repeats" />}
    </button>
  );
}
