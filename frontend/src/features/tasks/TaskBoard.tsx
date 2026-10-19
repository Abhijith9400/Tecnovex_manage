"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GripVertical, Plus } from "@/components/ui/icons";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types/models";
import { TaskCard } from "./TaskModal";

export const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "IN_REVIEW", label: "In review" },
  { status: "DONE", label: "Done" },
];

function DraggableTask({ task, showAssignee, onOpen, saving }: { task: Task; showAssignee: boolean; onOpen: () => void; saving: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { status: task.status } });
  return (
    <div ref={setNodeRef} className={cn("group relative", isDragging && "opacity-30", saving && "animate-pulse")}>
      {/* Whole card is draggable; a short drag moves it, a click (no movement) opens it. */}
      <div {...listeners} {...attributes} aria-roledescription="draggable task" className="cursor-grab touch-none active:cursor-grabbing">
        <TaskCard task={task} showAssignee={showAssignee} onOpen={onOpen} />
      </div>
      <GripVertical className="pointer-events-none absolute top-3 -left-0.5 size-4 text-slate-300 opacity-0 group-hover:opacity-100" aria-hidden />
    </div>
  );
}

function Column({ status, label, count, children, isOver, onAdd }: { status: TaskStatus; label: string; count: number; children: React.ReactNode; isOver?: boolean; onAdd?: () => void }) {
  const { setNodeRef, isOver: over } = useDroppable({ id: status });
  const highlighted = isOver ?? over;
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn("flex min-h-48 flex-col rounded-xl p-3 transition-colors", highlighted ? "bg-accent-soft ring-2 ring-accent/50" : "bg-slate-100/70")}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">{label}</h2>
          <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted">{count}</span>
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            title="Add a task"
            aria-label={`Add a task to ${label}`}
            className="flex size-7 items-center justify-center rounded-lg bg-accent text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            <Plus className="size-4" strokeWidth={2.5} />
          </button>
        )}
      </header>
      <div className="flex-1 space-y-2">{children}</div>
    </section>
  );
}

/**
 * Kanban board. Dropping a card on another column changes its status immediately (optimistic) and saves
 * it through the same API as the status buttons; on failure the card snaps back with an error toast.
 */
export function TaskBoard({
  tasks,
  showAssignee,
  onOpen,
  onChanged,
  onAdd,
}: {
  tasks: Task[];
  showAssignee: boolean;
  onOpen: (id: string) => void;
  onChanged: () => void;
  /** Shown as a + button on the To do column (admins and managers only). */
  onAdd?: () => void;
}) {
  const { notify } = useToast();
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // Small movement threshold so a plain click still opens the task.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const statusOf = (task: Task) => overrides[task.id] ?? task.status;
  const activeTask = tasks.find((t) => t.id === activeId) ?? null;

  async function move(task: Task, to: TaskStatus) {
    const from = statusOf(task);
    if (from === to) return;
    setOverrides((o) => ({ ...o, [task.id]: to }));
    setSaving((s) => new Set(s).add(task.id));
    try {
      await api.post(`/tasks/${task.id}/status`, { status: to });
      notify(`"${task.title}" moved to ${BOARD_COLUMNS.find((c) => c.status === to)?.label}`);
      onChanged();
    } catch (error) {
      setOverrides((o) => ({ ...o, [task.id]: from }));
      notify(errorMessage(error), "error");
    } finally {
      setSaving((s) => {
        const next = new Set(s);
        next.delete(task.id);
        return next;
      });
    }
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const task = tasks.find((t) => t.id === event.active.id);
    const to = event.over?.id as TaskStatus | undefined;
    if (task && to) void move(task, to);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((column) => {
          const items = tasks.filter((t) => statusOf(t) === column.status);
          return (
            <Column key={column.status} status={column.status} label={column.label} count={items.length} onAdd={column.status === "TODO" ? onAdd : undefined}>
              {items.length === 0 && <p className="rounded-lg border-2 border-dashed border-slate-200 px-1 py-6 text-center text-xs text-muted">Drop a task here</p>}
              {items.map((t) => (
                <DraggableTask key={t.id} task={t} showAssignee={showAssignee} onOpen={() => onOpen(t.id)} saving={saving.has(t.id)} />
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="w-72 rotate-2 cursor-grabbing shadow-xl">
            <TaskCard task={activeTask} showAssignee={showAssignee} onOpen={() => undefined} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
