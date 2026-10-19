"use client";

import { MailCheck } from "@/components/ui/icons";
import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert, Badge, Spinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface SecuritySettingsData {
  loginOtpEnabled: boolean;
  /** False when LOGIN_OTP_ENABLED=false in the server .env, which overrides this switch. */
  serverAllowsOtp: boolean;
  mailConfigured: boolean;
}

export function SecuritySettings() {
  const settings = useAsync(() => api.get<SecuritySettingsData>("/settings/security"), []);
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();

  async function toggle(next: boolean) {
    setSaving(true);
    try {
      await api.put<SecuritySettingsData>("/settings/security", { loginOtpEnabled: next });
      notify(next ? "Email code at sign-in turned on" : "Email code at sign-in turned off");
      settings.reload();
    } catch (err) {
      notify(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  if (settings.error) return <Alert>{settings.error}</Alert>;
  if (!settings.data) return <Spinner />;
  const { loginOtpEnabled, serverAllowsOtp, mailConfigured } = settings.data;
  const active = loginOtpEnabled && serverAllowsOtp;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Sign-in security" description="Controls how everyone signs in to the app, including staff and client portal users." />
        <div className="flex items-start justify-between gap-6 px-5 py-5">
          <div className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <MailCheck className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p id="otp-label" className="text-sm font-medium text-ink">
                  Email code at sign-in
                </p>
                {active ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
              </div>
              <p className="mt-0.5 max-w-xl text-sm text-muted">
                After entering the correct password, users must also type a 6-digit code sent to their email. Turning this off lets people sign in with the password
                alone. Password reset by email keeps working either way.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={loginOtpEnabled}
            aria-labelledby="otp-label"
            disabled={saving || settings.loading || !serverAllowsOtp}
            onClick={() => void toggle(!loginOtpEnabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              loginOtpEnabled && serverAllowsOtp ? "bg-accent" : "bg-slate-300",
            )}
          >
            <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", loginOtpEnabled && serverAllowsOtp ? "translate-x-5.5" : "translate-x-0.5")} />
          </button>
        </div>
      </Card>

      {!serverAllowsOtp && (
        <Alert variant="info">
          The email code is turned off on the server (LOGIN_OTP_ENABLED=false in the backend .env file), so this switch has no effect. Set it to true and restart the
          backend to use this switch.
        </Alert>
      )}
      {serverAllowsOtp && !mailConfigured && (
        <Alert>Email (SMTP) is not configured on the server, so sign-in codes can&apos;t be delivered. Configure SMTP before relying on the email code.</Alert>
      )}
    </div>
  );
}
