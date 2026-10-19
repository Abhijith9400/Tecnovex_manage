"use client";

import { Plus, Trash2 } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { Alert, Badge } from "@/components/ui/Feedback";
import { CsvButton, DateRange, currentMonthRange } from "@/components/ui/Filters";
import { Field, Select } from "@/components/ui/Form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { RequireRole } from "@/features/auth/RequireRole";
import { api, approvalMessage, errorMessage, isApprovalRequested } from "@/lib/api";
import { useForm } from "@/lib/form";
import { useAsync, useDebounced } from "@/lib/hooks";
import { humanize, todayInput } from "@/lib/labels";
import { enumOptions, useClientOptions } from "@/lib/options";
import { formatDate } from "@/lib/utils";
import type { PaginationMeta } from "@/types/api";
import type { WorkLogEntry } from "@/types/models";

interface TaskOption {
  id: string;
  title: string;
  clientId: string | null;
  taskType: WorkLogEntry["taskType"];
}

interface EmployeeOption {
  id: string;
  fullName: string;
  employeeCode: string;
}

const TASK_TYPES = [
  "DESIGN",
  "VIDEO_EDITING",
  "CONTENT_WRITING",
  "SOCIAL_MEDIA_MANAGEMENT",
  "ADS_MANAGEMENT",
  "PHOTOGRAPHY",
  "STRATEGY",
  "CLIENT_MEETING",
  "REVISIONS",
  "ADMIN",
  "OTHER",
] as const;

export default function WorkLogPage() {
  const { user } = useAuth();
  const isManager = user.role === "ADMIN" || user.role === "MANAGER";
  const clients = useClientOptions(true);
  const employees = useAsync(() => (isManager ? api.get<EmployeeOption[]>("/employees/options") : Promise.resolve(null)), [isManager]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ ...currentMonthRange(), employeeId: "", clientId: "", taskType: "" });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<WorkLogEntry | "new" | null>(null);
  const debounced = useDebounced(search);
  const query = { ...filters, search: debounced };
  const logs = useAsync(() => api.list<WorkLogEntry>("/work-logs", { ...query, page }), [JSON.stringify(query), page]);
  const meta = logs.data?.meta as (PaginationMeta & { totalHours?: string }) | undefined;

  function setFilter(patch: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  return (
    <RequireRole roles={["ADMIN", "MANAGER", "EMPLOYEE"]}>
      <PageHeader
        title={isManager ? "Work Log" : "My Work Log"}
        description={isManager ? "What the team worked on, for which client, and how long it took." : "Record what you worked on each day and how long it took."}
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Log work
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Hours (filtered)" value={meta?.totalHours ?? "…"} />
        <StatCard label="Entries" value={meta?.total ?? "…"} />
      </div>
      <Card>
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search work, client…"
          />
          <DateRange from={filters.from} to={filters.to} onChange={(r) => setFilter(r)} />
          {isManager && (
            <FilterSelect
              label="Employee"
              value={filters.employeeId}
              onChange={(v) => setFilter({ employeeId: v })}
              options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.fullName }))}
            />
          )}
          <FilterSelect label="Client" value={filters.clientId} onChange={(v) => setFilter({ clientId: v })} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Task" value={filters.taskType} onChange={(v) => setFilter({ taskType: v })} options={enumOptions(TASK_TYPES)} />
          <div className="sm:ml-auto">
            <CsvButton href={api.url("/work-logs", { ...query, format: "csv" })} />
          </div>
        </Toolbar>
        <DataTable
          rows={logs.data?.items}
          loading={logs.loading}
          error={logs.error}
          onRowClick={setEditing}
          emptyTitle="No work logged in this period"
          columns={[
            { header: "Date", cell: (l) => <span className="whitespace-nowrap">{formatDate(l.workDate)}</span> },
            ...(isManager ? [{ header: "Employee", cell: (l: WorkLogEntry) => l.employee?.fullName }] : []),
            { header: "Client", cell: (l) => l.client?.name ?? <span className="text-muted">Internal</span> },
            { header: "Task", cell: (l) => <Badge>{humanize(l.taskType)}</Badge> },
            {
              header: "Work done",
              cell: (l) => (
                <div>
                  <p className="font-medium">{l.title}</p>
                  {l.description && <p className="line-clamp-1 text-xs text-muted">{l.description}</p>}
                </div>
              ),
            },
            { header: "Hours", align: "right", cell: (l) => <span className="font-medium">{l.hours}</span> },
          ]}
        />
        <Pagination meta={logs.data?.meta} onPage={setPage} />
      </Card>
      {editing && (
        <WorkLogModal
          entry={editing === "new" ? null : editing}
          isManager={isManager}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            logs.reload();
          }}
        />
      )}
    </RequireRole>
  );
}

function WorkLogModal({ entry, isManager, onClose, onSaved }: { entry: WorkLogEntry | null; isManager: boolean; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const clients = useClientOptions();
  const employees = useAsync(() => (isManager ? api.get<EmployeeOption[]>("/employees/options") : Promise.resolve(null)), [isManager]);
  const form = useForm({
    employeeId: entry?.employeeId ?? "",
    clientId: entry?.clientId ?? "",
    workDate: entry?.workDate.slice(0, 10) ?? todayInput(),
    hours: entry?.hours ? String(Number(entry.hours)) : "",
    taskType: entry?.taskType ?? "DESIGN",
    title: entry?.title ?? "",
    description: entry?.description ?? "",
    taskId: (entry as (WorkLogEntry & { taskId?: string | null }) | null)?.taskId ?? "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const employeeOptions = employees.data ?? (entry?.employee ? [entry.employee] : []);
  // Open tasks of the selected employee (or the signed-in employee) for "what task was this for".
  const taskOptions = useAsync(
    () => (isManager && !form.values.employeeId ? Promise.resolve([]) : api.get<TaskOption[]>("/tasks/options", { employeeId: form.values.employeeId })),
    [isManager, form.values.employeeId],
  );

  function chooseTask(taskId: string) {
    const task = taskOptions.data?.find((t) => t.id === taskId);
    form.setValues((v) => ({
      ...v,
      taskId,
      ...(task ? { clientId: task.clientId ?? "", taskType: task.taskType, title: v.title || task.title } : {}),
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = { ...form.values, hours: Number(form.values.hours) };
    const saved = await form.submit(() => (entry ? api.put(`/work-logs/${entry.id}`, body) : api.post("/work-logs", body)));
    if (saved) {
      notify(entry ? "Entry updated" : "Work logged");
      onSaved();
    }
  }

  async function remove() {
    if (!entry) return;
    setDeleting(true);
    try {
      const result = await api.delete(`/work-logs/${entry.id}`);
      notify(isApprovalRequested(result) ? approvalMessage(result) : "Entry deleted");
      onSaved();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open
      title={entry ? "Edit work entry" : "Log work"}
      onClose={onClose}
      footer={
        <>
          {entry && (
            <Button variant="ghost" className="mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="work-form" loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="work-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormGrid>
          {isManager && (
            <SelectField
              form={form}
              name="employeeId"
              label="Employee"
              required
              placeholder="Choose an employee"
              options={employeeOptions.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))}
            />
          )}
          <Field label="Task" hint="Optional. Picking a task fills in its client and type, and adds the time to that task.">
            {(props) => (
              <Select {...props} value={String(form.values.taskId)} onChange={(e) => chooseTask(e.target.value)}>
                <option value="">Not for a specific task</option>
                {(taskOptions.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <TextField form={form} name="workDate" label="Date" type="date" required />
          <SelectField form={form} name="clientId" label="Client" placeholder="Internal / no client" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <SelectField form={form} name="taskType" label="Task type" options={enumOptions(TASK_TYPES)} />
          <TextField form={form} name="hours" label="Time spent (hours)" type="number" step="0.25" min="0.25" max="24" required hint="e.g. 1.5 = 1 h 30 min" />
        </FormGrid>
        <TextField form={form} name="title" label="Work done" required placeholder="e.g. Designed 3 Diwali carousel slides" />
        <TextAreaField form={form} name="description" label="Details" rows={3} />
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this entry?"
        message="The hours are removed from work reports. The deletion is recorded in the audit log."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}
