"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { RequireRole } from "@/features/auth/RequireRole";
import { CreativeGallery } from "@/features/creatives/CreativeGallery";
import { roleGroups } from "@/lib/navigation";

export default function CreativesPage() {
  return (
    <RequireRole roles={roleGroups.WORK}>
      <PageHeader title="Creative Shelf" description="Posters, carousels, videos and reels for every client, with campaign, platform and publishing status." />
      <CreativeGallery />
    </RequireRole>
  );
}
