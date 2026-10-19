"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs } from "@/components/ui/Misc";
import { RequireRole } from "@/features/auth/RequireRole";
import { PortalContentCalendars } from "@/features/contentCalendars/PortalContentCalendars";
import { PortalGallery } from "@/features/portal/PortalGallery";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

type TabKey = "creatives" | "calendar";

export default function PortalPage() {
  const profile = useAsync(() => api.get<{ client: { name: string }; agencyName: string }>("/portal/me"), []);
  const [tab, setTab] = useState<TabKey>("creatives");
  const from = profile.data?.agencyName ? ` from ${profile.data.agencyName}` : "";
  return (
    <RequireRole roles={["CLIENT"]}>
      <PageHeader
        title={profile.data ? profile.data.client.name : "My creatives"}
        description={
          tab === "creatives"
            ? `Approved and published work${from}. Preview anything, then download the original files individually or as a ZIP.`
            : `Monthly content plans${from}. View them in your browser or download a copy.`
        }
      />
      <Tabs
        tabs={[
          { value: "creatives", label: "Creatives" },
          { value: "calendar", label: "Content calendar" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "creatives" ? <PortalGallery /> : <PortalContentCalendars />}
    </RequireRole>
  );
}
