"use client";

import { ArrowLeft } from "@/components/ui/icons";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AuthBrand, COMPANY_NAME } from "@/components/layout/AuthBrand";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field, Input } from "@/components/ui/Form";
import { api, errorMessage, setCsrfToken } from "@/lib/api";
import type { AuthUser } from "@/types/models";

type LoginResult =
  | { otpRequired: false; user: AuthUser; csrfToken: string }
  | { otpRequired: true; challengeId: string; emailHint: string; expiresInMinutes: number; resendInSeconds: number };

function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  // Only allow same-site relative paths.
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; emailHint: string; minutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<LoginResult>("/auth/login", { email, password });
      if (result.otpRequired) {
        setChallenge({ id: result.challengeId, emailHint: result.emailHint, minutes: result.expiresInMinutes });
        setLoading(false);
        return;
      }
      setCsrfToken(result.csrfToken);
      window.location.replace(safeNext());
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <AuthBrand />
        <div className="mb-6 flex flex-col items-center text-center">
          <h1 className="text-xl font-semibold text-ink">{challenge ? "Check your email" : `Sign in to ${COMPANY_NAME}`}</h1>
          <p className="mt-1 text-sm text-muted">
            {challenge ? (
              <>
                We sent a 6-digit code to <span className="font-medium text-ink">{challenge.emailHint}</span>.
              </>
            ) : (
              "Use the account provided by your administrator."
            )}
          </p>
        </div>

        {challenge ? (
          <OtpStep
            challengeId={challenge.id}
            minutes={challenge.minutes}
            onBack={() => {
              setChallenge(null);
              setPassword("");
            }}
          />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-card p-6" noValidate>
            {error && <Alert>{error}</Alert>}
            <Field label="Email" required>
              {(props) => <Input {...props} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            </Field>
            <Field label="Password" required>
              {(props) => <Input {...props} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
            </Field>
            <div className="-mt-2 text-right">
              <Link href="/forgot-password" className="text-sm font-medium text-accent hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button type="submit" loading={loading} className="w-full">
              Continue
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Second step: six digit boxes (paste-friendly, works with phone autofill), resend with cooldown. */
function OtpStep({ challengeId, minutes, onBack }: { challengeId: string; minutes: number; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function verify(code: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<{ user: AuthUser; csrfToken: string }>("/auth/verify-otp", { challengeId, code });
      setCsrfToken(result.csrfToken);
      window.location.replace(safeNext());
    } catch (err) {
      setError(errorMessage(err));
      setDigits(Array(6).fill(""));
      setLoading(false);
      setTimeout(() => inputs.current[0]?.focus(), 0);
    }
  }

  function setDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      // Pasted or autofilled the whole code.
      const next = clean.slice(0, 6).split("");
      const filled = [...next, ...Array(6 - next.length).fill("")];
      setDigits(filled);
      inputs.current[Math.min(next.length, 5)]?.focus();
      if (next.length === 6) void verify(next.join(""));
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < 5) inputs.current[index + 1]?.focus();
    if (next.every((d) => d)) void verify(next.join(""));
  }

  async function resend() {
    setError(null);
    setInfo(null);
    try {
      const result = await api.post<{ emailHint: string; resendInSeconds: number }>("/auth/resend-otp", { challengeId });
      setInfo(`A new code was sent to ${result.emailHint}.`);
      setCooldown(result.resendInSeconds);
      setDigits(Array(6).fill(""));
      inputs.current[0]?.focus();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const code = digits.join("");
    if (code.length === 6) void verify(code);
    else setError("Enter all 6 digits.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-card p-6" noValidate>
      {error && <Alert>{error}</Alert>}
      {info && <Alert variant="success">{info}</Alert>}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Verification code</legend>
        <div className="flex justify-between gap-2">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputs.current[index] = el;
              }}
              value={digit}
              onChange={(e) => setDigit(index, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
              }}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={index === 0 ? 6 : 1}
              aria-label={`Digit ${index + 1}`}
              disabled={loading}
              className="h-12 w-11 rounded-lg border border-line text-center text-xl font-semibold text-ink focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">The code expires in {minutes} minutes. Check spam if you don&apos;t see it.</p>
      </fieldset>
      <Button type="submit" loading={loading} className="w-full">
        Verify and sign in
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Back
        </button>
        <button type="button" onClick={resend} disabled={cooldown > 0} className="font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline">
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
