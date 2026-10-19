"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DateRange, currentMonthRange } from "@/components/ui/Filters";
import { Tabs } from "@/components/ui/Misc";
import { useAuth } from "@/features/auth/AuthProvider";
import { RequireRole } from "@/features/auth/RequireRole";
import { ClientDashboard } from "@/features/dashboard/ClientDashboard";
import { EmployeeDashboard } from "@/features/dashboard/EmployeeDashboard";
import { FinanceDashboard } from "@/features/dashboard/FinanceDashboard";
import { WorkDashboard } from "@/features/dashboard/WorkDashboard";
import { roleGroups } from "@/lib/navigation";
import type { Role } from "@/types/models";

type TabKey = "work" | "finance";

const tabs: { value: TabKey; label: string; roles: Role[]; description: string }[] = [
  { value: "work", label: "Work", roles: roleGroups.OPERATIONS, description: "Tasks, team workload, creatives and deadlines. Completed tasks follow the selected period." },
  { value: "finance", label: "Finance", roles: roleGroups.FINANCE, description: "Cash received and paid in the selected period, plus open invoices." },
];

/** Employees and clients get a personal dashboard; staff get the work and finance tabs. */
export default function DashboardPage() {
  const { user } = useAuth();
  if (user.role === "EMPLOYEE") return <EmployeeDashboard />;
  if (user.role === "CLIENT") return <ClientDashboard />;
  return <StaffDashboard />;
}

function StaffDashboard() {
  const { hasRole } = useAuth();
  const visible = tabs.filter((tab) => hasRole(tab.roles));
  const [active, setActive] = useState<TabKey>(visible[0]?.value ?? "finance");
  const [range, setRange] = useState(currentMonthRange);

  return (
    <RequireRole roles={roleGroups.DASHBOARD}>
      <PageHeader title="Dashboard" description={tabs.find((t) => t.value === active)?.description} actions={<DateRange from={range.from} to={range.to} onChange={setRange} />} />
      {visible.length > 1 && <Tabs tabs={visible} active={active} onChange={setActive} />}
      {active === "work" && <WorkDashboard range={range} />}
      {active === "finance" && <FinanceDashboard range={range} />}
    </RequireRole>
  );
}
