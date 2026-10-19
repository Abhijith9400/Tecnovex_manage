"use client";

import { Columns3, List, Plus } from "@/components/ui/icons";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { Alert, Badge, Spinner } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/Misc";
import { useAuth } from "@/features/auth/AuthProvider";
import { RequireRole } from "@/features/auth/RequireRole";
import { TaskBoard } from "@/features/tasks/TaskBoard";
import { TASK_PRIORITIES, TASK_STATUSES, TaskModal } from "@/features/tasks/TaskModal";
import { api } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { enumOptions, useClientOptions } from "@/lib/options";
import { cn, formatDate } from "@/lib/utils";
import type { PaginationMeta } from "@/types/api";
import type { Task, TaskStatus } from "@/types/models";

interface Summary {
  byStatus: Partial<Record<TaskStatus, number>>;
  overdue: number;
}

export default function TasksPage() {
  const { user } = useAuth();
  // Admins, managers and employees all run the shared board; an employee's delete goes for approval.
  const canManage = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "EMPLOYEE";
  const clients = useClientOptions(true);
  const employees = useAsync(() => (canManage ? api.get<{ id: string; fullName: string }[]>("/employees/options") : Promise.resolve(null)), [canManage]);
  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ assigneeId: "", clientId: "", priority: "", status: "", overdue: false });
  const [page, setPage] = useState(1);
  const [openTask, setOpenTask] = useState<string | "new" | null>(null);
  const debounced = useDebounced(search);

  const query = { ...filters, search: debounced, page: view === "board" ? 1 : page, pageSize: view === "board" ? 100 : 20 };
  const tasks = useAsync(() => api.list<Task>("/tasks", query), [JSON.stringify(query)]);
  const summary = (tasks.data?.meta as (PaginationMeta & { summary?: Summary }) | undefined)?.summary;

  function setFilter(patch: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  return (
    <RequireRole roles={["ADMIN", "MANAGER", "EMPLOYEE"]}>
      <PageHeader
        title={canManage ? "Tasks" : "My Tasks"}
        description={canManage ? "Assign work to employees and follow it from to-do to done." : "Work assigned to you. Move each task along as you go and post updates."}
        actions={
          canManage && (
            <Button onClick={() => setOpenTask("new")}>
              <Plus className="size-4" /> Assign task
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="To do" value={summary?.byStatus.TODO ?? 0} />
        <StatCard label="In progress" value={summary?.byStatus.IN_PROGRESS ?? 0} />
        <StatCard label="In review" value={summary?.byStatus.IN_REVIEW ?? 0} />
        <button onClick={() => setFilter({ overdue: !filters.overdue })} className="text-left" aria-pressed={filters.overdue}>
          <StatCard label={filters.overdue ? "Overdue (filter on)" : "Overdue"} value={<span className={summary?.overdue ? "text-danger" : ""}>{summary?.overdue ?? 0}</span>} hint="Click to show only overdue" />
        </button>
      </div>

      <Card className="mb-4">
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search tasks…"
          />
          {canManage && (
            <FilterSelect label="Assignee" value={filters.assigneeId} onChange={(v) => setFilter({ assigneeId: v })} options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.fullName }))} />
          )}
          <FilterSelect label="Client" value={filters.clientId} onChange={(v) => setFilter({ clientId: v })} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Priority" value={filters.priority} onChange={(v) => setFilter({ priority: v })} options={enumOptions(TASK_PRIORITIES)} />
          {view === "list" && <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter({ status: v })} options={enumOptions(TASK_STATUSES)} />}
          <div className="flex rounded-lg border border-line p-0.5 sm:ml-auto">
            {(["board", "list"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                aria-pressed={view === mode}
                className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium", view === mode ? "bg-accent-soft text-accent-hover" : "text-muted hover:text-ink")}
              >
                {mode === "board" ? <Columns3 className="size-4" /> : <List className="size-4" />} {mode === "board" ? "Board" : "List"}
              </button>
            ))}
          </div>
        </Toolbar>
      </Card>

      {tasks.error ? (
        <Alert>{tasks.error}</Alert>
      ) : !tasks.data ? (
        <Spinner />
      ) : view === "board" ? (
        <>
          <p className="mb-2 text-xs text-muted">Drag a card to another column to update its status. Click a card to open it.</p>
          <TaskBoard tasks={tasks.data.items} showAssignee={canManage} onOpen={(id) => setOpenTask(id)} onChanged={tasks.reload} onAdd={canManage ? () => setOpenTask("new") : undefined} />
        </>
      ) : (
        <Card>
          <DataTable
            rows={tasks.data.items}
            loading={tasks.loading}
            onRowClick={(t) => setOpenTask(t.id)}
            emptyTitle={canManage ? "No tasks yet" : "No tasks assigned to you"}
            columns={[
              {
                header: "Task",
                cell: (t) => (
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-muted">{[t.client?.name ?? "Internal", humanize(t.taskType)].join(" · ")}</p>
                  </div>
                ),
              },
              ...(canManage ? [{ header: "Assignee", cell: (t: Task) => t.assignee.fullName }] : []),
              { header: "Priority", cell: (t) => <StatusBadge status={t.priority} /> },
              { header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
              {
                header: "Due",
                cell: (t) => (t.dueDate ? <span className={cn("whitespace-nowrap", t.overdue && "font-medium text-danger")}>{formatDate(t.dueDate)}</span> : <span className="text-muted">—</span>),
              },
              { header: "Hours", align: "right", cell: (t) => `${t.loggedHours}${t.estimatedHours ? ` / ${Number(t.estimatedHours)}` : ""}` },
              { header: "", cell: (t) => (t.overdue ? <Badge tone="danger">Overdue</Badge> : null) },
            ]}
          />
          <Pagination meta={tasks.data.meta} onPage={setPage} />
        </Card>
      )}

      {openTask && <TaskModal taskId={openTask === "new" ? null : openTask} canManage={canManage} onClose={() => setOpenTask(null)} onChanged={tasks.reload} />}
    </RequireRole>
  );
}
