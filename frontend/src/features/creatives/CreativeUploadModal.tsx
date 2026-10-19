"use client";

import { UploadCloud, X } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { getCsrfToken } from "@/lib/api";
import { useForm } from "@/lib/form";
import { useAsync } from "@/lib/hooks";
import { formatBytes } from "@/lib/labels";
import { enumOptions, useClientOptions } from "@/lib/options";
import { api } from "@/lib/api";
import { uploadWithProgress } from "@/lib/upload";
import type { Creative, Project } from "@/types/models";
import { CREATIVE_STATUSES, CREATIVE_TYPES, PLATFORMS } from "./constants";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm";
const MAX_FILES = 20;

export function CreativeUploadModal({ clientId, onClose, onUploaded }: { clientId?: string; onClose: () => void; onUploaded: () => void }) {
  const { notify } = useToast();
  const clients = useClientOptions();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const form = useForm({
    clientId: clientId ?? "",
    title: "",
    campaign: "",
    contentType: "POSTER",
    platform: "INSTAGRAM",
    status: "DRAFT",
    publishDate: "",
    projectId: "",
    caption: "",
    internalNotes: "",
  });
  const selectedClient = form.values.clientId;
  const projects = useAsync(
    () => (selectedClient ? api.list<Project>("/projects", { clientId: selectedClient, pageSize: 100 }) : Promise.resolve(null)),
    [selectedClient],
  );

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)].slice(0, MAX_FILES));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.values.clientId) return form.setFormError("Choose a client.");
    if (files.length === 0) return form.setFormError("Add at least one image or video.");
    const body = new FormData();
    for (const [key, value] of Object.entries(form.values)) if (key !== "clientId") body.append(key, String(value));
    for (const file of files) body.append("files", file);
    const created = await form.submit(async () => {
      setProgress(0);
      try {
        return await uploadWithProgress<Creative>(`/clients/${form.values.clientId}/creatives`, body, await getCsrfToken(), setProgress);
      } finally {
        setProgress(null);
      }
    });
    if (created) {
      notify("Creative uploaded");
      onUploaded();
    }
  }

  return (
    <Modal
      open
      size="lg"
      title="Upload creative"
      description="Images up to the configured limit; videos are streamed to storage, never held in memory."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={form.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="creative-form" loading={form.submitting}>
            {progress !== null ? `Uploading ${progress}%` : "Upload"}
          </Button>
        </>
      }
    >
      <form id="creative-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <Field label="Files" required hint={`Posters, carousel slides (several images), videos or reels. Up to ${MAX_FILES} files.`}>
          {(props) => (
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-6 text-center hover:border-accent"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
            >
              <UploadCloud className="size-6 text-muted" />
              <span className="text-sm text-ink">Drop files here or click to browse</span>
              <span className="text-xs text-muted">JPG, PNG, WEBP, GIF, MP4, MOV, WEBM</span>
              <input {...props} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            </label>
          )}
        </Field>
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded border border-line px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="text-xs text-muted">{formatBytes(file.size)}</span>
                <button type="button" onClick={() => setFiles((f) => f.filter((_, i) => i !== index))} className="text-muted hover:text-danger" aria-label={`Remove ${file.name}`}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {progress !== null && (
          <div className="h-2 overflow-hidden rounded-full bg-page" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <FormGrid>
          {!clientId && (
            <SelectField form={form} name="clientId" label="Client" required placeholder="Choose a client" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          )}
          <TextField form={form} name="title" label="Content title" required />
          <TextField form={form} name="campaign" label="Campaign" />
          <SelectField form={form} name="contentType" label="Content type" options={enumOptions(CREATIVE_TYPES)} />
          <SelectField form={form} name="platform" label="Platform" options={enumOptions(PLATFORMS)} />
          <SelectField form={form} name="status" label="Status" options={enumOptions(CREATIVE_STATUSES)} />
          <TextField form={form} name="publishDate" label="Publication date" type="date" />
          <SelectField
            form={form}
            name="projectId"
            label="Project"
            placeholder="None"
            options={(projects.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
        </FormGrid>
        <TextAreaField form={form} name="caption" label="Caption" rows={3} />
        <TextAreaField form={form} name="internalNotes" label="Internal notes" rows={2} />
      </form>
    </Modal>
  );
}
