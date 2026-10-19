"use client";

import { CalendarClock, Clock, Send, Trash2 } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Alert, Badge, Spinner } from "@/components/ui/Feedback";
import { Textarea } from "@/components/ui/Form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { DetailList, StatusBadge, Tabs } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, approvalMessage, errorMessage, isApprovalRequested } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { enumOptions, useClientOptions } from "@/lib/options";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types/models";
import { TaskHistory } from "./TaskHistory";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const WORK_TYPES = ["DESIGN", "VIDEO_EDITING", "CONTENT_WRITING", "SOCIAL_MEDIA_MANAGEMENT", "ADS_MANAGEMENT", "PHOTOGRAPHY", "STRATEGY", "CLIENT_MEETING", "REVISIONS", "ADMIN", "OTHER"] as const;

const statusLabel: Record<TaskStatus, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", DONE: "Done", CANCELLED: "Cancelled" };

/** Create (taskId = null), or view/update an existing task. Managers can edit everything; employees update status and comment. */
export function TaskModal({ taskId, canManage, onClose, onChanged }: { taskId: string | null; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const task = useAsync(() => (taskId ? api.get<Task>(`/tasks/${taskId}`) : Promise.resolve(null)), [taskId]);
  const [editing, setEditing] = useState(taskId === null);

  if (taskId && !task.data) {
    return (
      <Modal open title="Task" onClose={onClose}>
        {task.error ? <Alert>{task.error}</Alert> : <Spinner />}
      </Modal>
    );
  }

  if (editing && canManage) {
    return (
      <TaskForm
        task={task.data ?? null}
        onClose={() => (taskId ? setEditing(false) : onClose())}
        onSaved={() => {
          onChanged();
          if (taskId) {
            setEditing(false);
            task.reload();
          } else onClose();
        }}
      />
    );
  }

  return (
    <TaskDetail
      task={task.data!}
      canManage={canManage}
      onEdit={() => setEditing(true)}
      onClose={onClose}
      onChanged={() => {
        task.reload();
        onChanged();
      }}
      onDeleted={() => {
        onChanged();
        onClose();
      }}
    />
  );
}

function TaskDetail({ task, canManage, onEdit, onClose, onChanged, onDeleted }: { task: Task; canManage: boolean; onEdit: () => void; onClose: () => void; onChanged: () => void; onDeleted: () => void }) {
  const { notify } = useToast();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [view, setView] = useState<"details" | "history">("details");
  // Employees can ask for a delete; a manager or admin approves it.
  const deleteNeedsApproval = useAuth().user.role === "EMPLOYEE";
  const nextStatuses: TaskStatus[] = (canManage ? TASK_STATUSES : TASK_STATUSES.filter((s) => s !== "CANCELLED")).filter((s) => s !== task.status) as TaskStatus[];

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      notify(message);
      onChanged();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    await run(() => api.post(`/tasks/${task.id}/comments`, { body: comment.trim() }), "Comment added");
    setComment("");
  }

  async function remove() {
    setBusy(true);
    try {
      const result = await api.delete(`/tasks/${task.id}`);
      if (isApprovalRequested(result)) {
        notify(approvalMessage(result));
        setBusy(false);
        setConfirmDelete(false);
        return;
      }
      notify("Task deleted");
      onDeleted();
    } catch (error) {
      notify(errorMessage(error), "error");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={task.title}
      description={[task.client?.name ?? "Internal", humanize(task.taskType)].join(" · ")}
      onClose={onClose}
      footer={
        canManage ? (
          <>
            <Button variant="ghost" className="mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> {deleteNeedsApproval ? "Request delete" : "Delete"}
            </Button>
            <Button variant="secondary" onClick={onEdit}>
              Edit / reassign
            </Button>
          </>
        ) : undefined
      }
    >
      <Tabs
        tabs={[
          { value: "details", label: "Details" },
          { value: "history", label: `History (${task.history?.length ?? 0})` },
        ]}
        active={view}
        onChange={setView}
      />
      {view === "history" ? (
        <TaskHistory history={task.history ?? []} />
      ) : (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <Badge tone={task.priority === "URGENT" ? "danger" : task.priority === "HIGH" ? "warning" : "neutral"}>{humanize(task.priority)} priority</Badge>
          {task.overdue && <Badge tone="danger">Overdue</Badge>}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted uppercase">Move to</p>
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((s) => (
              <Button key={s} size="sm" variant={s === "DONE" ? "primary" : "secondary"} disabled={busy} onClick={() => run(() => api.post(`/tasks/${task.id}/status`, { status: s }), `Moved to ${statusLabel[s]}`)}>
                {statusLabel[s]}
              </Button>
            ))}
          </div>
        </div>

        <DetailList
          items={[
            { label: "Assigned to", value: `${task.assignee.fullName} (${task.assignee.employeeCode})` },
            { label: "Assigned by", value: task.assignedBy?.name },
            { label: "Due date", value: task.dueDate ? formatDate(task.dueDate) : "No due date" },
            { label: "Time", value: `${task.loggedHours} h logged${task.estimatedHours ? ` of ${Number(task.estimatedHours)} h estimated` : ""}` },
            { label: "Started", value: task.startedAt ? formatDateTime(task.startedAt) : null },
            { label: "Completed", value: task.completedAt ? formatDateTime(task.completedAt) : null },
          ]}
        />
        {task.description && (
          <div>
            <p className="text-xs font-medium text-muted">Details</p>
            <p className="mt-1 text-sm whitespace-pre-line">{task.description}</p>
          </div>
        )}

        {(task.workLogs?.length ?? 0) > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted uppercase">Time logged</p>
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {task.workLogs!.map((l) => (
                <li key={l.id} className="flex justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate">
                    {formatDate(l.workDate)} · {l.employee.fullName} · {l.title}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{l.hours} h</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-muted uppercase">Updates</p>
          <ul className="mb-3 space-y-2">
            {(task.comments ?? []).length === 0 && <li className="text-sm text-muted">No updates yet.</li>}
            {(task.comments ?? []).map((c) => (
              <li key={c.id} className="rounded-lg bg-page px-3 py-2 text-sm">
                <p className="text-xs text-muted">
                  <span className="font-medium text-ink">{c.author?.name ?? "Someone"}</span> · {formatDateTime(c.createdAt)}
                </p>
                <p className="mt-0.5 whitespace-pre-line">{c.body}</p>
              </li>
            ))}
          </ul>
          <form onSubmit={addComment} className="flex items-end gap-2">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Add an update, question or link…" aria-label="Add an update" />
            <Button type="submit" loading={busy} disabled={!comment.trim()} aria-label="Post update">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={deleteNeedsApproval ? "Ask to delete this task?" : "Delete this task?"}
        message={
          deleteNeedsApproval
            ? "A manager or administrator has to approve it. The task stays until then."
            : "Its updates are deleted too. Time already logged stays in the Work Log, unlinked."
        }
        confirmLabel={deleteNeedsApproval ? "Send request" : "Delete"}
        destructive
        loading={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}

const defaults = { title: "", description: "", clientId: "", assigneeId: "", taskType: "DESIGN", priority: "MEDIUM", status: "TODO", dueDate: "", estimatedHours: "" };

function TaskForm({ task, onClose, onSaved }: { task: Task | null; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const clients = useClientOptions();
  const employees = useAsync(() => api.get<{ id: string; fullName: string; employeeCode: string }[]>("/employees/options"), []);
  const form = useForm(toFormValues(defaults, task as unknown as Record<string, unknown>));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() => (task ? api.put(`/tasks/${task.id}`, form.values) : api.post("/tasks", form.values)));
    if (saved) {
      notify(task ? "Task updated" : "Task assigned");
      onSaved();
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={task ? "Edit task" : "Assign a task"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" loading={form.submitting}>
            {task ? "Save" : "Assign task"}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <TextField form={form} name="title" label="Task" required placeholder="e.g. Design 3 Diwali carousel slides for Acme" />
        <TextAreaField form={form} name="description" label="Details / instructions" rows={4} />
        <FormGrid>
          <SelectField
            form={form}
            name="assigneeId"
            label="Assign to"
            required
            placeholder="Choose an employee"
            options={(employees.data ?? []).map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))}
          />
          <SelectField form={form} name="clientId" label="Client" placeholder="Internal / no client" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <SelectField form={form} name="taskType" label="Type of work" options={enumOptions(WORK_TYPES)} />
          <SelectField form={form} name="priority" label="Priority" options={enumOptions(TASK_PRIORITIES)} />
          <TextField form={form} name="dueDate" label="Due date" type="date" />
          <TextField form={form} name="estimatedHours" label="Estimated hours" type="number" step="0.25" min="0.25" />
          {task && <SelectField form={form} name="status" label="Status" options={TASK_STATUSES.map((s) => ({ value: s, label: statusLabel[s] }))} />}
        </FormGrid>
      </form>
    </Modal>
  );
}

/** Compact card used on the board. */
export function TaskCard({ task, onOpen, showAssignee }: { task: Task; onOpen: () => void; showAssignee: boolean }) {
  return (
    <button onClick={onOpen} className="w-full rounded-lg border border-line bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-sm leading-snug font-medium text-ink">{task.title}</p>
        <span
          className={cn(
            "mt-0.5 size-2 shrink-0 rounded-full",
            task.priority === "URGENT" ? "bg-danger" : task.priority === "HIGH" ? "bg-warning" : task.priority === "MEDIUM" ? "bg-blue-500" : "bg-slate-300",
          )}
          title={`${humanize(task.priority)} priority`}
        />
      </div>
      <p className="truncate text-xs text-muted">{[task.client?.name ?? "Internal", humanize(task.taskType)].join(" · ")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {showAssignee && <span className="font-medium text-ink">{task.assignee.fullName}</span>}
        {task.dueDate && (
          <span className={cn("inline-flex items-center gap-1", task.overdue && "font-medium text-danger")}>
            <CalendarClock className="size-3.5" /> {formatDate(task.dueDate)}
          </span>
        )}
        {(Number(task.loggedHours) > 0 || task.estimatedHours) && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> {task.loggedHours}
            {task.estimatedHours ? `/${Number(task.estimatedHours)}` : ""} h
          </span>
        )}
      </div>
    </button>
  );
}
