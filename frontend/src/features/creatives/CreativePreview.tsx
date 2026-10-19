"use client";

import { ChevronLeft, ChevronRight, Download, ExternalLink, Plus, Trash2 } from "@/components/ui/icons";
import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Alert } from "@/components/ui/Feedback";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { DetailList, StatusBadge } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api, approvalMessage, errorMessage, getCsrfToken, isApprovalRequested } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { formatBytes, humanize } from "@/lib/labels";
import { enumOptions } from "@/lib/options";
import { uploadWithProgress } from "@/lib/upload";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Creative } from "@/types/models";
import { CREATIVE_STATUSES, CREATIVE_TYPES, PLATFORMS } from "./constants";
import { MediaPreview } from "./CreativeThumb";

const defaults = { title: "", campaign: "", contentType: "POSTER", platform: "INSTAGRAM", status: "DRAFT", publishDate: "", projectId: "", caption: "", internalNotes: "" };

export function CreativePreview({ creative, onClose, onChanged }: { creative: Creative; onClose: () => void; onChanged: (updated: Creative | null) => void }) {
  const { notify } = useToast();
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useForm(toFormValues(defaults, creative as unknown as Record<string, unknown>));
  const base = `/clients/${creative.clientId}/creatives/${creative.id}`;
  const file = creative.files[Math.min(index, creative.files.length - 1)];

  async function save(event: FormEvent) {
    event.preventDefault();
    const updated = await form.submit(() => api.put<Creative>(base, form.values));
    if (updated) {
      notify("Creative updated");
      setEditing(false);
      onChanged(updated);
    }
  }

  async function quickStatus(status: string) {
    try {
      const updated = await api.put<Creative>(base, { ...toFormValues(defaults, creative as unknown as Record<string, unknown>), status });
      notify(`Marked ${humanize(status).toLowerCase()}`);
      onChanged(updated);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const body = new FormData();
    for (const f of Array.from(list)) body.append("files", f);
    setProgress(0);
    try {
      const updated = await uploadWithProgress<Creative>(`${base}/files`, body, await getCsrfToken(), setProgress);
      notify("Files added");
      onChanged(updated);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeFile(fileId: string) {
    try {
      const updated = await api.delete<unknown>(`${base}/files/${fileId}`);
      if (isApprovalRequested(updated)) return notify(approvalMessage(updated));
      setIndex(0);
      onChanged(updated as Creative);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const result = await api.delete(base);
      if (isApprovalRequested(result)) return notify(approvalMessage(result));
      notify("Creative deleted");
      onChanged(null);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Modal open size="xl" title={creative.title} description={[creative.client?.name, creative.campaign].filter(Boolean).join(" · ")} onClose={onClose}>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-slate-900">
            {file && <MediaPreview key={file.id} file={file} controls className="max-h-full max-w-full object-contain" />}
            {creative.files.length > 1 && (
              <>
                <button
                  onClick={() => setIndex((i) => (i - 1 + creative.files.length) % creative.files.length)}
                  className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow"
                  aria-label="Previous"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button onClick={() => setIndex((i) => (i + 1) % creative.files.length)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow" aria-label="Next">
                  <ChevronRight className="size-5" />
                </button>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                  {index + 1} / {creative.files.length}
                </span>
              </>
            )}
          </div>
          {file && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
              <span className="min-w-0 flex-1 truncate">
                {file.originalName} · {formatBytes(file.sizeBytes)}
              </span>
              <a href={api.fileUrl(file.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
                <ExternalLink className="size-3.5" /> Open
              </a>
              <a href={api.fileUrl(file.id, true)} className="inline-flex items-center gap-1 hover:text-ink">
                <Download className="size-3.5" /> Download
              </a>
              {creative.files.length > 1 && (
                <button onClick={() => removeFile(file.id)} className="inline-flex items-center gap-1 hover:text-danger">
                  <Trash2 className="size-3.5" /> Remove
                </button>
              )}
            </div>
          )}
          {creative.files.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {creative.files.map((f, i) => (
                <button key={f.id} onClick={() => setIndex(i)} className={`size-14 shrink-0 overflow-hidden rounded border-2 ${i === index ? "border-accent" : "border-transparent"}`}>
                  <MediaPreview file={f} className="size-full" />
                </button>
              ))}
            </div>
          )}
          <input ref={fileInput} type="file" multiple accept="image/*,video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => fileInput.current?.click()} loading={progress !== null}>
            <Plus className="size-4" /> {progress !== null ? `Uploading ${progress}%` : "Add files"}
          </Button>
        </div>

        <div>
          {editing ? (
            <form onSubmit={save} className="space-y-4" noValidate>
              {form.formError && <Alert>{form.formError}</Alert>}
              <TextField form={form} name="title" label="Title" required />
              <FormGrid>
                <TextField form={form} name="campaign" label="Campaign" />
                <SelectField form={form} name="contentType" label="Type" options={enumOptions(CREATIVE_TYPES)} />
                <SelectField form={form} name="platform" label="Platform" options={enumOptions(PLATFORMS)} />
                <SelectField form={form} name="status" label="Status" options={enumOptions(CREATIVE_STATUSES)} />
                <TextField form={form} name="publishDate" label="Publication date" type="date" />
              </FormGrid>
              <TextAreaField form={form} name="caption" label="Caption" rows={3} />
              <TextAreaField form={form} name="internalNotes" label="Internal notes" rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={form.submitting}>
                  Save
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={creative.status} />
                {creative.status === "DRAFT" && (
                  <Button size="sm" variant="secondary" onClick={() => quickStatus("APPROVED")}>
                    Mark approved
                  </Button>
                )}
                {creative.status === "APPROVED" && (
                  <Button size="sm" variant="secondary" onClick={() => quickStatus("PUBLISHED")}>
                    Mark published
                  </Button>
                )}
              </div>
              <DetailList
                items={[
                  { label: "Content type", value: humanize(creative.contentType) },
                  { label: "Platform", value: humanize(creative.platform) },
                  { label: "Campaign", value: creative.campaign },
                  { label: "Project", value: creative.project?.name },
                  { label: "Uploaded", value: `${formatDate(creative.createdAt)}${creative.uploadedBy ? ` by ${creative.uploadedBy.name}` : ""}` },
                  { label: "Publication date", value: formatDate(creative.publishDate) },
                ]}
              />
              <DetailList items={[{ label: "Caption", value: creative.caption }]} />
              <DetailList items={[{ label: "Internal notes", value: creative.internalNotes }]} />
              <div>
                <p className="text-xs font-medium text-muted">Boosts</p>
                {!creative.boosts?.length ? (
                  <p className="mt-0.5 text-sm text-muted">Not boosted yet. Add a campaign under Ad Campaigns and pick this creative.</p>
                ) : (
                  <div className="mt-1.5 space-y-1.5">
                    <p className="text-sm font-medium text-ink">
                      {creative.boostSummary?.count}× boosted · {formatCurrency(creative.boostSummary?.spend)} spent · {new Intl.NumberFormat("en-IN").format(creative.boostSummary?.results ?? 0)} results
                    </p>
                    <ul className="divide-y divide-line rounded-lg border border-line text-xs">
                      {creative.boosts.map((b) => (
                        <li key={b.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{b.name}</span>
                            <span className="text-muted">
                              {humanize(b.campaignType)} · {formatDate(b.startDate)}
                              {b.endDate ? ` – ${formatDate(b.endDate)}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-medium tabular-nums">{formatCurrency(b.spend)}</span>
                            <span className="text-muted tabular-nums">
                              {b.results} {b.resultLabel ?? "results"}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="flex gap-2 border-t border-line pt-4">
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  Edit details
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this creative?"
        message="The creative and all of its files will be permanently removed. To keep it out of view instead, set its status to Archived."
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}
