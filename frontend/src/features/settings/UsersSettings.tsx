"use client";

import { Plus } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Alert, Badge } from "@/components/ui/Feedback";
import { CheckboxField, FormGrid, SelectField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { api } from "@/lib/api";
import { useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import { useClientOptions } from "@/lib/options";
import { roleLabels } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import type { Employee, UserAccount } from "@/types/models";

const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ value, label }));

export function UsersSettings() {
  const users = useAsync(() => api.get<UserAccount[]>("/auth/users"), []);
  const [editing, setEditing] = useState<UserAccount | "new" | null>(null);
  const isAdmin = useAuth().user.role === "ADMIN";

  return (
    <Card>
      <CardHeader
        title="Users"
        description="Administrators manage everything and approve money entries. Managers can do everything else; their payments, expenses and payroll payouts wait for an administrator, and they cannot edit or void payments or expenses. Accountants handle finance. Employees run the day-to-day work; their deletes wait for a manager. Client (portal) logins download their own approved creatives."
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add user
          </Button>
        }
      />
      <DataTable
        rows={users.data}
        loading={users.loading}
        error={users.error}
        // Only administrators can change an administrator's login.
        onRowClick={(row) => (row.role !== "ADMIN" || isAdmin) && setEditing(row)}
        columns={[
          { header: "Name", cell: (u) => <span className="font-medium">{u.name}</span> },
          { header: "Email", cell: (u) => u.email },
          { header: "Role", cell: (u) => roleLabels[u.role] },
          { header: "Linked to", cell: (u) => u.client?.name ?? u.employee?.fullName ?? "—" },
          { header: "Status", cell: (u) => (u.isActive ? <Badge tone="success">Active</Badge> : <Badge>Disabled</Badge>) },
          { header: "Last sign-in", cell: (u) => formatDateTime(u.lastLoginAt) },
        ]}
      />
      {editing && (
        <UserModal
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            users.reload();
          }}
        />
      )}
    </Card>
  );
}

function UserModal({ user, onClose, onSaved }: { user: UserAccount | null; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const { user: me } = useAuth();
  const employees = useAsync(() => api.list<Employee>("/employees", { pageSize: 100 }), []);
  const clients = useClientOptions();
  const form = useForm({
    name: user?.name ?? "",
    email: user?.email ?? "",
    role: user?.role ?? "MANAGER",
    employeeId: user?.employeeId ?? "",
    clientId: user?.clientId ?? "",
    password: "",
    isActive: user?.isActive ?? true,
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const v = form.values;
    const saved = await form.submit(() =>
      user
        ? api.patch(`/auth/users/${user.id}`, {
            name: v.name,
            role: v.role,
            isActive: v.isActive,
            employeeId: v.employeeId || null,
            clientId: v.clientId || null,
            ...(v.password ? { password: v.password } : {}),
          })
        : api.post("/auth/users", { name: v.name, email: v.email, role: v.role, password: v.password, employeeId: v.employeeId || null, clientId: v.clientId || null }),
    );
    if (saved) {
      notify(user ? "User updated" : "User created");
      onSaved();
    }
  }

  return (
    <Modal
      open
      title={user ? `Edit ${user.name}` : "Add user"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <FormGrid>
          <TextField form={form} name="name" label="Name" required />
          <TextField form={form} name="email" label="Email" type="email" required disabled={Boolean(user)} />
          <SelectField
            form={form}
            name="role"
            label="Role"
            options={me.role === "ADMIN" ? roleOptions : roleOptions.filter((o) => o.value !== "ADMIN")}
            required
            disabled={user?.id === me.id}
          />
          {form.values.role === "CLIENT" ? (
            <SelectField
              form={form}
              name="clientId"
              label="Client"
              required
              placeholder="Choose the client"
              hint="They will only see this client's approved and published creatives."
              options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          ) : (
            <SelectField
              form={form}
              name="employeeId"
              label="Linked employee"
              placeholder="None"
              hint="Required for the Employee role."
              options={(employees.data?.items ?? []).map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))}
            />
          )}
          <TextField
            form={form}
            name="password"
            label={user ? "Reset password" : "Password"}
            type="password"
            autoComplete="new-password"
            required={!user}
            hint={user ? "Leave blank to keep the current password. Resetting signs the user out." : "At least 12 characters."}
          />
          {user && user.id !== me.id && <CheckboxField form={form} name="isActive" label="Account active" />}
        </FormGrid>
      </form>
    </Modal>
  );
}
