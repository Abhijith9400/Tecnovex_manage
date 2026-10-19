"use client";

import { ShieldAlert } from "@/components/ui/icons";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import type { Role } from "@/types/models";
import { useAuth } from "./AuthProvider";

/** Hides a page from roles that cannot use it. The API enforces the same rules. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(roles)) {
    return (
      <Card>
        <EmptyState icon={ShieldAlert} title="No access" description="Your role does not have access to this section. Ask an administrator if you need it." />
      </Card>
    );
  }
  return <>{children}</>;
}
