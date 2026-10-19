"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs } from "@/components/ui/Misc";
import { useAuth } from "@/features/auth/AuthProvider";
import { AccountSettings } from "@/features/settings/AccountSettings";
import { CategoriesSettings } from "@/features/settings/CategoriesSettings";
import { CompanySettingsForm } from "@/features/settings/CompanySettingsForm";
import { SecuritySettings } from "@/features/settings/SecuritySettings";
import { StatutorySettings } from "@/features/settings/StatutorySettings";
import { TemplatesSettings } from "@/features/settings/TemplatesSettings";
import { UsersSettings } from "@/features/settings/UsersSettings";
import type { Role } from "@/types/models";

type TabKey = "company" | "templates" | "categories" | "statutory" | "users" | "security" | "account";

const tabs: { value: TabKey; label: string; roles: Role[] }[] = [
  { value: "company", label: "Company", roles: ["ADMIN", "MANAGER"] },
  { value: "templates", label: "Invoice templates", roles: ["ADMIN", "MANAGER"] },
  { value: "categories", label: "Categories", roles: ["ADMIN", "ACCOUNTANT", "MANAGER"] },
  { value: "statutory", label: "Payroll deductions", roles: ["ADMIN", "MANAGER"] },
  { value: "users", label: "Users", roles: ["ADMIN", "MANAGER"] },
  { value: "security", label: "Security", roles: ["ADMIN"] },
  { value: "account", label: "My account", roles: ["ADMIN", "ACCOUNTANT", "MANAGER", "EMPLOYEE", "CLIENT"] },
];

export default function SettingsPage() {
  const { hasRole } = useAuth();
  const visible = tabs.filter((tab) => hasRole(tab.roles));
  const [active, setActive] = useState<TabKey>(visible[0].value);

  return (
    <>
      <PageHeader title="Settings" description="Company profile, invoice design, categories, payroll rules, user access and sign-in security." />
      <Tabs tabs={visible} active={active} onChange={setActive} />
      {active === "company" && <CompanySettingsForm />}
      {active === "templates" && <TemplatesSettings />}
      {active === "categories" && <CategoriesSettings />}
      {active === "statutory" && <StatutorySettings />}
      {active === "users" && <UsersSettings />}
      {active === "security" && <SecuritySettings />}
      {active === "account" && <AccountSettings />}
    </>
  );
}
