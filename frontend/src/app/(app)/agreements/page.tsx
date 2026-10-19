"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs } from "@/components/ui/Misc";
import { AgreementList } from "@/features/agreements/AgreementList";
import { ProjectList } from "@/features/agreements/ProjectList";
import { RequireRole } from "@/features/auth/RequireRole";
import { roleGroups } from "@/lib/navigation";

export default function AgreementsPage() {
  const [tab, setTab] = useState<"agreements" | "projects">("agreements");
  return (
    <RequireRole roles={roleGroups.STAFF}>
      <PageHeader title="Agreements & Scope" description="Signed agreements, scope of work, deliverables, renewals and client projects." />
      <Tabs
        tabs={[
          { value: "agreements", label: "Agreements" },
          { value: "projects", label: "Projects" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "agreements" ? <AgreementList /> : <ProjectList />}
    </RequireRole>
  );
}
