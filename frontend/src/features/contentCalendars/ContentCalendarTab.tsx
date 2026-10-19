"use client";

import { CalendarRange, Download, Eye, EyeOff, FileUp, Plus, Sparkles, Trash2, Users } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Alert, Badge, EmptyState, Spinner } from "@/components/ui/Feedback";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, approvalMessage, errorMessage, fieldErrors, isApprovalRequested } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { cn, formatDate } from "@/lib/utils";
import { monthName, type ContentCalendar, type PlanEntry, PLAN_TYPES } from "./contentCalendar";

/** Content calendars for one client: upload a file or build a PDF from the app calendar, and share with the client. */
export function ContentCalendarTab({ clientId, canAdd }: { clientId: string; canAdd: boolean }) {
  const { hasRole } = useAuth();
  const canManage = hasRole(["ADMIN", "MANAGER", "EMPLOYEE"]);
  const list = useAsync(() => api.get<ContentCalendar[]>("/content-calendars", { clientId }), [clientId]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ContentCalendar | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { notify } = useToast();

  async function toggleShare(c: ContentCalendar) {
    setBusy(c.id);
    try {
      await api.put(`/content-calendars/${c.id}`, { period: c.period, title: c.title, notes: c.notes ?? "", sharedWithClient: !c.sharedWithClient });
      notify(c.sharedWithClient ? "Hidden from the client" : "Shared with the client");
      list.reload();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(removing.id);
    try {
      const result = await api.delete(`/content-calendars/${removing.id}`);
      notify(isApprovalRequested(result) ? approvalMessage(result) : "Content calendar deleted");
      list.reload();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(null);
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Monthly content plans for this client. Upload your own file, or create a PDF straight from the calendar. Shared calendars appear in the client&apos;s portal to view
          and download.
        </p>
        {canManage && canAdd && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add content calendar
          </Button>
        )}
      </div>

      {list.error && <Alert>{list.error}</Alert>}
      {!list.data ? (
        !list.error && <Spinner />
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarRange} title="No content calendars yet" description="Add one for the month: upload a file or create a PDF from this client's calendar." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((c) => (
            <Card key={c.id} className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", c.kind === "GENERATED" ? "bg-accent-soft text-accent" : "bg-blue-50 text-blue-700")}>
                  {c.kind === "GENERATED" ? <Sparkles className="size-5" aria-hidden /> : <FileUp className="size-5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{c.title}</p>
                  <p className="text-xs text-muted">{monthName(c.period)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={c.kind === "GENERATED" ? "accent" : "info"}>{c.kind === "GENERATED" ? "PDF from calendar · always up to date" : (c.file?.originalName ?? "Uploaded file")}</Badge>
                {c.sharedWithClient ? <Badge tone="success">Shared with client</Badge> : <Badge>Not shared</Badge>}
              </div>
              {c.notes && <p className="mt-2 line-clamp-2 text-xs text-muted">{c.notes}</p>}
              <p className="mt-2 text-xs text-muted">
                Added {formatDate(c.createdAt)}
                {c.createdBy ? ` by ${c.createdBy.name}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <a href={api.url(`/content-calendars/${c.id}/file`)} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="secondary">
                    <Eye className="size-4" /> View
                  </Button>
                </a>
                <a href={api.url(`/content-calendars/${c.id}/file`, { download: "true" })}>
                  <Button size="sm" variant="secondary">
                    <Download className="size-4" /> Download
                  </Button>
                </a>
                {canManage && (
                  <>
                    <Button size="sm" variant="ghost" loading={busy === c.id} onClick={() => void toggleShare(c)} title={c.sharedWithClient ? "Hide from the client" : "Share with the client"}>
                      {c.sharedWithClient ? <EyeOff className="size-4" /> : <Users className="size-4" />} {c.sharedWithClient ? "Unshare" : "Share"}
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto text-muted hover:text-danger" onClick={() => setRemoving(c)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {adding && (
        <AddCalendarModal
          clientId={clientId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Delete this content calendar?"
        message={removing ? `"${removing.title}" will no longer be available to the client. Calendar events are not affected.` : ""}
        confirmLabel="Delete"
        destructive
        loading={busy === removing?.id}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function nextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function AddCalendarModal({ clientId, onClose, onSaved }: { clientId: string; onClose: () => void; onSaved: () => void }) {
  const [period, setPeriod] = useState(nextMonth);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<"GENERATED" | "UPLOADED">("GENERATED");
  const [file, setFile] = useState<File | null>(null);
  const [share, setShare] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();
  const preview = useAsync(
    () => (source === "GENERATED" && period ? api.get<PlanEntry[]>("/content-calendars/preview", { clientId, period }) : Promise.resolve(null)),
    [source, period, clientId],
  );
  const placeholder = period ? `${monthName(period)} content calendar` : "Content calendar";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setError(null);
    if (source === "UPLOADED" && !file) {
      setErrors({ file: "Choose the file to upload" });
      return;
    }
    const body = new FormData();
    body.append("clientId", clientId);
    body.append("period", period);
    body.append("title", title.trim() || placeholder);
    body.append("notes", notes);
    body.append("sharedWithClient", String(share));
    if (source === "UPLOADED" && file) body.append("file", file);
    setSaving(true);
    try {
      await api.post("/content-calendars", body);
      notify(share ? "Content calendar added and shared with the client" : "Content calendar added");
      onSaved();
    } catch (err) {
      const mapped = fieldErrors(err);
      setErrors(mapped);
      setError(Object.keys(mapped).length ? null : errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title="Add content calendar"
      description="Plan for one month. Share it and the client can view and download it in their portal."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="content-calendar-form" loading={saving}>
            {source === "GENERATED" ? "Create PDF calendar" : "Upload calendar"}
          </Button>
        </>
      }
    >
      <form id="content-calendar-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Month" required error={errors.period}>
            {(props) => <Input {...props} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />}
          </Field>
          <Field label="Title" error={errors.title} hint="Leave blank to use the suggested title.">
            {(props) => <Input {...props} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} maxLength={200} />}
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">How do you want to add it?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { value: "GENERATED", icon: Sparkles, title: "Create a PDF from the calendar", text: "Built from this client's posting dates, creatives to publish, shoots, festivals and campaign launches. Always up to date." },
                { value: "UPLOADED", icon: FileUp, title: "Upload a file", text: "A plan you prepared elsewhere: PDF, Excel, Word or an image (up to 25 MB)." },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                  source === option.value ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line hover:border-slate-300",
                )}
              >
                <input type="radio" name="source" className="sr-only" checked={source === option.value} onChange={() => setSource(option.value)} />
                <option.icon className={cn("mt-0.5 size-5 shrink-0", source === option.value ? "text-accent" : "text-muted")} aria-hidden />
                <span>
                  <span className="block text-sm font-medium text-ink">{option.title}</span>
                  <span className="block text-xs text-muted">{option.text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {source === "UPLOADED" ? (
          <Field label="File" required error={errors.file}>
            {(props) => (
              <Input
                {...props}
                type="file"
                accept=".pdf,.xlsx,.docx,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
              />
            )}
          </Field>
        ) : (
          <PlanPreview entries={preview.data ?? undefined} loading={preview.loading} error={preview.error} />
        )}

        <Field label="Note for the client" hint="Shown at the top of the PDF and in the portal.">
          {(props) => <Textarea {...props} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />}
        </Field>

        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
          <span>
            Share with the client
            <span className="block text-xs text-muted">They can view and download it in their portal. You can unshare it any time.</span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

function PlanPreview({ entries, loading, error }: { entries?: PlanEntry[]; loading: boolean; error?: string }) {
  if (error) return <Alert>{error}</Alert>;
  if (!entries) return loading ? <Spinner /> : null;
  return (
    <div className="rounded-xl border border-line">
      <p className="border-b border-line bg-page px-3 py-2 text-xs font-medium text-muted">
        {entries.length === 0
          ? "Nothing planned for this month yet. Add posting dates and creatives in the calendar first, or create it now and it will fill in as you plan."
          : `${entries.length} item(s) will appear in the PDF. Internal meetings and design deadlines are left out.`}
      </p>
      {entries.length > 0 && (
        <ul className="max-h-52 divide-y divide-line overflow-y-auto">
          {entries.map((e, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-14 shrink-0 text-xs text-muted tabular-nums">{e.date.slice(8)}/{e.date.slice(5, 7)}</span>
              <span className="size-2 shrink-0 rounded-full" style={{ background: PLAN_TYPES[e.type]?.color ?? "#64748B" }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink">{e.title}</span>
              <span className="hidden shrink-0 text-xs text-muted sm:inline">{PLAN_TYPES[e.type]?.label ?? e.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
