"use client";

import { type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Feedback";
import { TextField } from "@/components/ui/FormFields";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, errorMessage } from "@/lib/api";
import { useForm } from "@/lib/form";
import { roleLabels } from "@/lib/labels";

export function AccountSettings() {
  const { user, logout } = useAuth();
  const { notify } = useToast();
  const form = useForm({ currentPassword: "", newPassword: "", confirmPassword: "" });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (form.values.newPassword !== form.values.confirmPassword) {
      form.setFormError("The new passwords do not match.");
      return;
    }
    const done = await form.submit(() => api.post("/auth/change-password", { currentPassword: form.values.currentPassword, newPassword: form.values.newPassword }));
    if (done) {
      form.reset();
      notify("Password changed. Other devices have been signed out.");
    }
  }

  async function logoutAll() {
    try {
      await api.post("/auth/logout-all");
      await logout();
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="My account" />
        <div className="space-y-1 p-5 text-sm">
          <p className="font-medium text-ink">{user.name}</p>
          <p className="text-muted">{user.email}</p>
          <p className="text-muted">{roleLabels[user.role]}</p>
          <div className="pt-4">
            <Button variant="secondary" size="sm" onClick={logoutAll}>
              Sign out on all devices
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Change password" />
        <form onSubmit={onSubmit} className="space-y-4 p-5" noValidate>
          {form.formError && <Alert>{form.formError}</Alert>}
          <TextField form={form} name="currentPassword" label="Current password" type="password" autoComplete="current-password" required />
          <TextField form={form} name="newPassword" label="New password" type="password" autoComplete="new-password" hint="At least 12 characters." required />
          <TextField form={form} name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" required />
          <Button type="submit" loading={form.submitting}>
            Change password
          </Button>
        </form>
      </Card>
    </div>
  );
}
