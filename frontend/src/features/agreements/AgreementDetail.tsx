"use client";

import { Archive, Pencil, RotateCcw, Trash2, Upload } from "@/components/ui/icons";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/Card";
import { Alert, Badge } from "@/components/ui/Feedback";
import { DetailList, FileLink, StatusBadge } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, errorMessage } from "@/lib/api";
import { roleGroups } from "@/lib/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Agreement } from "@/types/models";
import { AgreementFormModal } from "./AgreementForm";

export function RenewalBadge({ agreement }: { agreement: Agreement }) {
  const r = agreement.renewal;
  if (!r || r.state === "NO_EXPIRY") return <Badge>No expiry</Badge>;
  if (r.state === "EXPIRED") return <Badge tone="danger">Expired {Math.abs(r.daysToExpiry ?? 0)}d ago</Badge>;
  if (r.state === "DUE_SOON") return <Badge tone="warning">Renew in {r.daysToExpiry}d</Badge>;
  return <Badge tone="success">{r.daysToExpiry}d left</Badge>;
}

export function AgreementDetailModal({ agreement, onClose, onChanged }: { agreement: Agreement; onClose: () => void; onChanged: (a: Agreement) => void }) {
  const { notify } = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole(roleGroups.OPERATIONS);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const a = agreement;

  async function run(action: () => Promise<Agreement>, message: string) {
    setBusy(true);
    try {
      onChanged(await action());
      notify(message);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function upload(files: FileList | null) {
    if (!files?.length) return;
    const body = new FormData();
    for (const file of Array.from(files)) body.append("files", file);
    void run(() => api.post<Agreement>(`/agreements/${a.id}/documents`, body), "Documents attached");
  }

  return (
    <Modal open size="xl" title={a.title} description={[a.client?.name, a.reference].filter(Boolean).join(" · ")} onClose={onClose}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={a.status} />
          <RenewalBadge agreement={a} />
          {a.archivedAt && <Badge>Archived</Badge>}
          {canEdit && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={busy}
                onClick={() => run(() => api.post<Agreement>(`/agreements/${a.id}/${a.archivedAt ? "restore" : "archive"}`), a.archivedAt ? "Agreement restored" : "Agreement archived")}
              >
                {a.archivedAt ? <RotateCcw className="size-4" /> : <Archive className="size-4" />} {a.archivedAt ? "Restore" : "Archive"}
              </Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Effective" value={formatDate(a.effectiveDate)} />
          <StatCard label="Expires" value={formatDate(a.expiryDate)} />
          <StatCard label="Contract value" value={formatCurrency(a.contractValue)} />
          <StatCard label="Revision limit" value={a.revisionLimit ?? "—"} />
        </div>
        <DetailList
          items={[
            { label: "Scope of work", value: a.scopeOfWork },
            { label: "Monthly deliverables", value: a.monthlyDeliverables },
            { label: "Posts / carousels / reels per month", value: [a.postsPerMonth, a.carouselsPerMonth, a.reelsPerMonth].map((n) => n ?? "—").join(" / ") },
            { label: "Exclusions", value: a.exclusions },
            { label: "Payment terms", value: a.paymentTerms },
            { label: "Notes", value: a.notes },
          ]}
        />
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Documents</h3>
            {canEdit && (
              <>
                <input ref={input} type="file" multiple accept="application/pdf,.docx,image/jpeg,image/png" className="hidden" onChange={(e) => upload(e.target.files)} />
                <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
                  <Upload className="size-4" /> Attach
                </Button>
              </>
            )}
          </div>
          {a.documents.length === 0 ? (
            <p className="text-sm text-muted">No documents attached.</p>
          ) : (
            <div className="space-y-2">
              {a.documents.map((doc) => (
                <FileLink
                  key={doc.id}
                  file={doc}
                  actions={
                    canEdit && (
                      <button
                        onClick={() => run(() => api.delete<Agreement>(`/agreements/${a.id}/documents/${doc.id}`), "Document removed")}
                        className="rounded p-1 text-muted hover:bg-page hover:text-danger"
                        title="Remove"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )
                  }
                />
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Uploaded files are stored copies for reference. Uploading a document does not by itself constitute or verify a legally valid signature.
          </p>
        </div>
        {a.renewal?.state === "DUE_SOON" && <Alert variant="info">This agreement expires within its {a.renewalReminderDays}-day reminder window. Plan the renewal with the client.</Alert>}
      </div>
      {editing && (
        <AgreementFormModal
          agreement={a}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setEditing(false);
            onChanged(updated);
          }}
        />
      )}
    </Modal>
  );
}
