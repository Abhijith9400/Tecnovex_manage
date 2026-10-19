import type { FileInfo } from "@/types/models";

export interface ContentCalendar {
  id: string;
  clientId: string;
  period: string;
  title: string;
  notes: string | null;
  kind: "UPLOADED" | "GENERATED";
  sharedWithClient: boolean;
  file: FileInfo | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string } | null;
}

/** What a client sees in the portal. */
export type PortalContentCalendar = Pick<ContentCalendar, "id" | "period" | "title" | "notes" | "kind" | "file" | "updatedAt">;

export interface PlanEntry {
  date: string;
  time: string | null;
  type: string;
  title: string;
  detail: string | null;
}

/** Same labels and colours as the PDF. */
export const PLAN_TYPES: Record<string, { label: string; color: string }> = {
  POST_SCHEDULE: { label: "Posting", color: "#16A34A" },
  CLIENT_SUBMISSION: { label: "For your review", color: "#7C3AED" },
  SHOOT: { label: "Shoot", color: "#2563EB" },
  CAMPAIGN_LAUNCH: { label: "Campaign launch", color: "#EA580C" },
  FESTIVAL: { label: "Festival / occasion", color: "#DB2777" },
  OTHER: { label: "Other", color: "#64748B" },
  CREATIVE: { label: "Content to publish", color: "#0D9488" },
  AD: { label: "Ad campaign starts", color: "#C2410C" },
};

export function monthName(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
