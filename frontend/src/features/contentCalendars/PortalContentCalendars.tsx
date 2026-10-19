"use client";

import { CalendarRange, Download, Eye, FileText, Sparkles } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert, EmptyState, Spinner } from "@/components/ui/Feedback";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { formatBytes } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { monthName, type PortalContentCalendar } from "./contentCalendar";

/** Content calendars the agency shared with this client: view in the browser or download. */
export function PortalContentCalendars() {
  const list = useAsync(() => api.get<PortalContentCalendar[]>("/portal/content-calendars"), []);

  if (list.error) return <Alert>{list.error}</Alert>;
  if (!list.data) return <Spinner />;
  if (list.data.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarRange} title="No content calendars yet" description="When your agency shares a monthly content plan, it appears here to view and download." />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {list.data.map((c) => {
        const viewUrl = api.url(`/portal/content-calendars/${c.id}/file`);
        const isPdf = c.kind === "GENERATED" || c.file?.mimeType === "application/pdf";
        return (
          <Card key={c.id} className="flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                {c.kind === "GENERATED" ? <Sparkles className="size-5" aria-hidden /> : <FileText className="size-5" aria-hidden />}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-accent uppercase">{monthName(c.period)}</p>
                <p className="truncate font-semibold text-ink">{c.title}</p>
                <p className="text-xs text-muted">
                  {c.kind === "GENERATED" ? "PDF" : c.file ? `${c.file.originalName} · ${formatBytes(c.file.sizeBytes)}` : "File"} · updated {formatDate(c.updatedAt)}
                </p>
              </div>
            </div>
            {c.notes && <p className="mt-3 text-sm text-ink">{c.notes}</p>}
            <div className="mt-auto flex gap-2 pt-4">
              <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="secondary" className="w-full">
                  <Eye className="size-4" /> {isPdf ? "View" : "Open"}
                </Button>
              </a>
              <a href={api.url(`/portal/content-calendars/${c.id}/file`, { download: "true" })} className="flex-1">
                <Button className="w-full">
                  <Download className="size-4" /> Download
                </Button>
              </a>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
