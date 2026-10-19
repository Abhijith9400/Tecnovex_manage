"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Feedback";
import { api, ApiError, setCsrfToken } from "@/lib/api";
import type { AuthUser, Role } from "@/types/models";

interface AuthContextValue {
  user: AuthUser;
  hasRole: (roles: Role[]) => boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function redirectToLogin() {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

/** Loads the signed-in user; unauthenticated visitors are sent to /login. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AuthUser>("/auth/me")
      .then(setUser)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) redirectToLogin();
        else setError(err instanceof Error ? err.message : "Could not load your session");
      });
    const onUnauthorized = () => redirectToLogin();
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setCsrfToken(null);
    router.replace("/login");
  }, [router]);

  const hasRole = useCallback((roles: Role[]) => (user ? roles.includes(user.role) : false), [user]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm font-semibold text-ink">Unable to load the application</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
        </div>
      </div>
    );
  }
  if (!user) return <Spinner label="Loading your workspace…" className="min-h-screen" />;

  return <AuthContext.Provider value={{ user, hasRole, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
