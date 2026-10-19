"use client";

import { Plus, Trash2 } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { Alert } from "@/components/ui/Feedback";
import { FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { StatusBadge } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, errorMessage } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { useAsync, useDebounced } from "@/lib/hooks";
import { roleGroups } from "@/lib/navigation";
import { enumOptions, useClientOptions } from "@/lib/options";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Agreement, Project } from "@/types/models";

const PROJECT_STATUSES = ["PLANNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;

export function ProjectList({ clientId }: { clientId?: string }) {
  const { hasRole } = useAuth();
  const canEdit = hasRole(roleGroups.OPERATIONS);
  const clients = useClientOptions();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ clientId: "", status: "" });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const debounced = useDebounced(search);

  const projects = useAsync(() => api.list<Project>("/projects", { ...filters, clientId: clientId ?? filters.clientId, search: debounced, page }), [clientId, filters, debounced, page]);

  return (
    <Card>
      <Toolbar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search projects…"
        />
        {!clientId && (
          <FilterSelect
            label="Client"
            value={filters.clientId}
            onChange={(v) => {
              setFilters((f) => ({ ...f, clientId: v }));
              setPage(1);
            }}
            options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => {
            setFilters((f) => ({ ...f, status: v }));
            setPage(1);
          }}
          options={enumOptions(PROJECT_STATUSES)}
        />
        {canEdit && (
          <Button size="sm" className="sm:ml-auto" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New project
          </Button>
        )}
      </Toolbar>
      <DataTable
        rows={projects.data?.items}
        loading={projects.loading}
        error={projects.error}
        onRowClick={canEdit ? setEditing : undefined}
        emptyTitle="No projects"
        columns={[
          {
            header: "Project",
            cell: (p) => (
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">{[!clientId && p.client?.name, p.agreement?.title].filter(Boolean).join(" · ")}</p>
              </div>
            ),
          },
          { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
          { header: "Start", cell: (p) => formatDate(p.startDate) },
          { header: "End", cell: (p) => formatDate(p.endDate) },
          { header: "Creatives", align: "right", cell: (p) => p._count?.creatives ?? 0 },
          { header: "Budget", align: "right", cell: (p) => formatCurrency(p.budget) },
        ]}
      />
      <Pagination meta={projects.data?.meta} onPage={setPage} />
      {editing && (
        <ProjectModal
          project={editing === "new" ? null : editing}
          clientId={clientId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            projects.reload();
          }}
        />
      )}
    </Card>
  );
}

function ProjectModal({ project, clientId, onClose, onSaved }: { project: Project | null; clientId?: string; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const clients = useClientOptions();
  const form = useForm(
    toFormValues(
      { clientId: clientId ?? "", agreementId: "", name: "", description: "", status: "PLANNED", startDate: "", endDate: "", budget: "" },
      project as unknown as Record<string, unknown>,
    ),
  );
  const agreements = useAsync(
    () => (form.values.clientId ? api.list<Agreement>("/agreements", { clientId: form.values.clientId, pageSize: 100 }) : Promise.resolve(null)),
    [form.values.clientId],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() => (project ? api.put(`/projects/${project.id}`, form.values) : api.post("/projects", form.values)));
    if (saved) {
      notify("Project saved");
      onSaved();
    }
  }

  async function remove() {
    if (!project) return;
    setDeleting(true);
    try {
      await api.delete(`/projects/${project.id}`);
      notify("Project deleted");
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
      title={project ? "Edit project" : "New project"}
      onClose={onClose}
      footer={
        <>
          {project && (
            <Button variant="ghost" className="mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormGrid>
          {!clientId && !project && (
            <SelectField form={form} name="clientId" label="Client" required placeholder="Choose a client" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          )}
          <TextField form={form} name="name" label="Project name" required />
          <SelectField form={form} name="status" label="Status" options={enumOptions(PROJECT_STATUSES)} />
          <SelectField form={form} name="agreementId" label="Agreement" placeholder="None" options={(agreements.data?.items ?? []).map((a) => ({ value: a.id, label: a.title }))} />
          <TextField form={form} name="startDate" label="Start date" type="date" />
          <TextField form={form} name="endDate" label="End date" type="date" />
          <MoneyField form={form} name="budget" label="Budget" />
        </FormGrid>
        <TextAreaField form={form} name="description" label="Description" rows={3} />
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete project?"
        message="Creatives linked to this project are kept and simply unlinked."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}
