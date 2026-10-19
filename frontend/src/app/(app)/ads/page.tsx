"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { AdCampaignList } from "@/features/ads/AdCampaignList";
import { RequireRole } from "@/features/auth/RequireRole";

export default function AdCampaignsPage() {
  return (
    <RequireRole roles={["ADMIN", "ACCOUNTANT", "MANAGER", "EMPLOYEE"]}>
      <PageHeader title="Ad Campaigns" description="Record every post boost, reel boost and paid campaign you run for a client, and keep its spend and results up to date. Month-end totals come from Reports › Client Ads." />
      <AdCampaignList />
    </RequireRole>
  );
}
