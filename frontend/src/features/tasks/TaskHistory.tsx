"use client";

import { ArrowRight, Clock, MessageSquare, MoveRight, Pencil, Plus, Trash2, UserRoundCog, type IconComponent } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/utils";
import type { TaskHistoryEntry } from "@/types/models";

const ICONS: Record<string, { icon: IconComponent; tone: string }> = {
  CREATE: { icon: Plus, tone: "bg-accent text-white" },
  UPDATE: { icon: Pencil, tone: "bg-blue-50 text-blue-600" },
  REASSIGN: { icon: UserRoundCog, tone: "bg-violet-50 text-violet-600" },
  STATUS_CHANGE: { icon: MoveRight, tone: "bg-amber-50 text-amber-600" },
  COMMENT: { icon: MessageSquare, tone: "bg-slate-100 text-slate-600" },
  TIME_LOGGED: { icon: Clock, tone: "bg-green-50 text-green-600" },
  TIME_REMOVED: { icon: Clock, tone: "bg-red-50 text-red-600" },
  DELETE: { icon: Trash2, tone: "bg-red-50 text-red-600" },
};

type Field = { field: string; from: string | null; to: string };

/** Normalises current ({ fields: [...] }) and older ({ key: { from, to } }) change formats. */
function fieldsOf(changes: TaskHistoryEntry["changes"]): Field[] {
  if (!changes) return [];
  if ("fields" in changes && Array.isArray(changes.fields)) return changes.fields as Field[];
  return Object.entries(changes)
    .filter(([, v]) => v && typeof v === "object" && "to" in (v as object))
    .map(([key, v]) => {
      const value = v as { from: unknown; to: unknown };
      return { field: key, from: value.from == null ? null : String(value.from), to: String(value.to ?? "—") };
    });
}

/** Full, time-stamped history of a task: creation, every edit (old → new), moves, reassignments, updates and time. */
export function TaskHistory({ history }: { history: TaskHistoryEntry[] }) {
  if (history.length === 0) return <p className="text-sm text-muted">No history recorded yet.</p>;
  // Newest first, like an activity feed.
  const entries = [...history].reverse();

  return (
    <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-line" aria-label="Task history">
      {entries.map((entry) => {
        const { icon: Icon, tone } = ICONS[entry.action] ?? ICONS.UPDATE;
        const fields = fieldsOf(entry.changes);
        const changes = (entry.changes ?? {}) as { comment?: string; work?: string };
        const isCreate = entry.action === "CREATE";
        return (
          <li key={entry.id} className="relative flex gap-3">
            <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card ${tone}`}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm text-ink">
                <span className="font-semibold">{entry.user?.name ?? "System"}</span> <span className="text-slate-700">{entry.summary.charAt(0).toLowerCase() + entry.summary.slice(1)}</span>
              </p>
              <p className="text-xs text-muted">
                <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
              </p>

              {fields.length > 0 && (
                <dl className="mt-2 space-y-1 rounded-lg border border-line bg-page/60 px-3 py-2 text-xs">
                  {fields.map((f) => (
                    <div key={f.field} className="flex flex-wrap items-baseline gap-x-1.5">
                      <dt className="font-medium text-muted">{f.field}:</dt>
                      <dd className="flex flex-wrap items-center gap-1.5 text-ink">
                        {!isCreate && f.from !== null && (
                          <>
                            <span className="text-slate-500 line-through decoration-slate-300">{f.from}</span>
                            <ArrowRight className="size-3 text-slate-400" aria-label="changed to" />
                          </>
                        )}
                        <span className="font-medium whitespace-pre-line">{f.to}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {changes.comment && <blockquote className="mt-2 rounded-lg border-l-2 border-accent bg-accent-soft/60 px-3 py-1.5 text-sm whitespace-pre-line text-ink">{changes.comment}</blockquote>}
              {changes.work && <p className="mt-1 text-xs text-muted">Work: {changes.work}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
