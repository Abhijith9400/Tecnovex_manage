"use client";

import { ArrowLeft } from "@/components/ui/icons";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { AuthBrand } from "@/components/layout/AuthBrand";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field, Input } from "@/components/ui/Form";
import { api, errorMessage, fieldErrors } from "@/lib/api";

interface ResetStart {
  resetId: string;
  emailHint: string;
  expiresInMinutes: number;
  resendInSeconds: number;
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [reset, setReset] = useState<ResetStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setReset(await api.post<ResetStart>("/auth/forgot-password", { email }));
      setStep("code");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const heading = { email: "Forgot your password?", code: "Check your email", done: "Password changed" }[step];

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <AuthBrand />
        <div className="mb-6 flex flex-col items-center text-center">
          <h1 className="text-xl font-semibold text-ink">{heading}</h1>
          <p className="mt-1 text-sm text-muted">
            {step === "email" && "Enter your account email and we'll send you a code to reset your password."}
            {step === "code" && (
              <>
                If an account exists for <span className="font-medium text-ink">{reset?.emailHint}</span>, a 6-digit code is on its way.
              </>
            )}
            {step === "done" && "All devices were signed out. Sign in with your new password."}
          </p>
        </div>

        {step === "email" && (
          <form onSubmit={requestCode} className="space-y-4 rounded-xl border border-line bg-card p-6" noValidate>
            {error && <Alert>{error}</Alert>}
            <Field label="Email" required>
              {(props) => <Input {...props} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}
            </Field>
            <Button type="submit" loading={loading} className="w-full">
              Send reset code
            </Button>
            <BackToSignIn />
          </form>
        )}

        {step === "code" && reset && <ResetForm reset={reset} onDone={() => setStep("done")} onStartOver={() => setStep("email")} />}

        {step === "done" && (
          <div className="rounded-xl border border-line bg-card p-6">
            <Link href="/login">
              <Button className="w-full">Go to sign in</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function BackToSignIn() {
  return (
    <Link href="/login" className="flex items-center justify-center gap-1 text-sm text-muted hover:text-ink">
      <ArrowLeft className="size-4" /> Back to sign in
    </Link>
  );
}

function ResetForm({ reset, onDone, onStartOver }: { reset: ResetStart; onDone: () => void; onStartOver: () => void }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(reset.resendInSeconds);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setErrors({});
    if (password !== confirm) {
      setErrors({ confirm: "The passwords don't match" });
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { resetId: reset.resetId, code: code.trim(), newPassword: password });
      onDone();
    } catch (err) {
      const mapped = fieldErrors(err);
      setErrors(mapped);
      setError(Object.keys(mapped).length ? null : errorMessage(err));
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    try {
      const result = await api.post<{ resendInSeconds: number }>("/auth/forgot-password/resend", { resetId: reset.resetId });
      setInfo("A new code was sent. Use the newest code.");
      setCooldown(result.resendInSeconds);
      setCode("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-card p-6" noValidate>
      {error && <Alert>{error}</Alert>}
      {info && <Alert variant="success">{info}</Alert>}
      <Field label="6-digit code" required error={errors.code} hint={`Expires in ${reset.expiresInMinutes} minutes. Check spam if you don't see it.`}>
        {(props) => (
          <Input
            {...props}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            className="h-12 text-center text-xl font-semibold tracking-[0.5em]"
            autoFocus
            required
          />
        )}
      </Field>
      <Field label="New password" required error={errors.newPassword} hint="At least 12 characters.">
        {(props) => <Input {...props} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
      </Field>
      <Field label="Confirm new password" required error={errors.confirm}>
        {(props) => <Input {...props} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />}
      </Field>
      <Button type="submit" loading={loading} className="w-full" disabled={code.length !== 6 || !password}>
        Set new password
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onStartOver} className="inline-flex items-center gap-1 text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Different email
        </button>
        <button type="button" onClick={resend} disabled={cooldown > 0} className="font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline">
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
