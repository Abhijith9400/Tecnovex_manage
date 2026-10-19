"use client";

import { ChevronLeft, ChevronRight } from "@/components/ui/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { addMonths, isSameDay, monthGrid, ymd } from "./calendarUtils";

/** Small month picker in the sidebar; clicking a day jumps the main calendar to it. */
export function MiniMonth({ selected, onSelect }: { selected: Date; onSelect: (day: Date) => void }) {
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const days = monthGrid(month);

  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-sm font-medium text-ink">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
        <div className="flex">
          <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} className="rounded-full p-1 text-muted hover:bg-page" aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} className="rounded-full p-1 text-muted hover:bg-page" aria-label="Next month">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-muted">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
        {days.map((day) => {
          const today = isSameDay(day, new Date());
          const isSelected = isSameDay(day, selected);
          return (
            <button
              key={ymd(day)}
              type="button"
              onClick={() => onSelect(day)}
              className={cn(
                "mx-auto flex size-7 items-center justify-center rounded-full text-[11px]",
                today ? "bg-accent font-semibold text-white" : isSelected ? "bg-accent-soft font-semibold text-accent-hover" : day.getMonth() === month.getMonth() ? "text-ink hover:bg-page" : "text-slate-400 hover:bg-page",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
