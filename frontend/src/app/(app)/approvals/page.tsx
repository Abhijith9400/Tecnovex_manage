"use client";

import { Check, CreditCard, Receipt, Trash2, Undo2, Wallet, X } from "@/components/ui/icons";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/DataTable";
import { Alert, Badge, EmptyState, Spinner } from "@/components/ui/Feedback";
import { Textarea } from "@/components/ui/Form";
import { Tabs } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { RequireRole } from "@/features/auth/RequireRole";
import { api, errorMessage } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { roleLabels } from "@/lib/labels";
import { roleGroups } from "@/lib/navigation";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

type Kind = "PAYMENT" | "EXPENSE" | "PAYROLL_PAYMENT" | "DELETE";
type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

interface ApprovalRequest {
  id: string;
  kind: Kind;
  status: Status;
  title: string;
  amount: string | null;
  attachmentId: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requestedBy: { id: string; name: string; role: string };
  reviewedBy: { id: string; name: string } | null;
  canReview: boolean;
  canCancel: boolean;
}

const KIND: Record<Kind, { label: string; icon: typeof Trash2 }> = {
  PAYMENT: { label: "Client payment", icon: CreditCard },
  EXPENSE: { label: "Expense", icon: Receipt },
  PAYROLL_PAYMENT: { label: "Payroll payout", icon: Wallet },
  DELETE: { label: "Delete request", icon: Trash2 },
};

const STATUS_TONE: Record<Status, "warning" | "success" | "danger" | "neutral"> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" };
const STATUS_LABEL: Record<Status, string> = { PENDING: "Waiting", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Withdrawn" };

type TabKey = "review" | "mine" | "history";

export default function ApprovalsPage() {
  const { user } = useAuth();
  const reviewer = user.role === "ADMIN" || user.role === "MANAGER";
  const tabs: { value: TabKey; label: string }[] = [
    ...(reviewer ? [{ value: "review" as const, label: "Waiting for me" }] : []),
    { value: "mine", label: "My requests" },
    ...(reviewer ? [{ value: "history" as const, label: "All history" }] : []),
  ];
  const [tab, setTab] = useState<TabKey>(tabs[0].value);
  const [page, setPage] = useState(1);
  const query = tab === "review" ? { toReview: "true" } : tab === "mine" ? { mine: "true" } : {};
  const list = useAsync(() => api.list<ApprovalRequest>("/approvals", { ...query, page }), [tab, page]);
  const [reviewing, setReviewing] = useState<{ request: ApprovalRequest; action: "approve" | "reject" } | null>(null);
  const { notify } = useToast();

  const rows = list.data?.items;

  async function withdraw(request: ApprovalRequest) {
    try {
      await api.post(`/approvals/${request.id}/cancel`);
      notify("Request withdrawn");
      list.reload();
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }

  const description =
    user.role === "ADMIN"
      ? "Approve payments, expenses and payroll payouts entered by managers, and delete requests from employees. Nothing changes until you approve."
      : user.role === "MANAGER"
        ? "Approve delete requests from employees. Your own payments, expenses and payroll payouts wait here for an administrator."
        : "Deletes you ask for wait here until a manager or administrator approves them.";

  return (
    <RequireRole roles={roleGroups.WORK}>
      <PageHeader title="Approvals" description={description} />
      <Tabs
        tabs={tabs}
        active={tab}
        onChange={(value) => {
          setTab(value);
          setPage(1);
        }}
      />
      {list.error && <Alert>{list.error}</Alert>}
      {!rows ? (
        !list.error && <Spinner />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={tab === "review" ? "Nothing waiting for you" : "No requests yet"}
            description={tab === "review" ? "New requests show up here and in the sidebar badge." : undefined}
          />
        </Card>
      ) : (
        <div className={cn("space-y-3", list.loading && "opacity-60")}>
          {rows.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onApprove={() => setReviewing({ request: r, action: "approve" })}
              onReject={() => setReviewing({ request: r, action: "reject" })}
              onWithdraw={() => void withdraw(r)}
            />
          ))}
          <Pagination meta={list.data?.meta} onPage={setPage} />
        </div>
      )}
      {reviewing && (
        <ReviewModal
          request={reviewing.request}
          action={reviewing.action}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null);
            list.reload();
            window.dispatchEvent(new Event("approvals:changed"));
          }}
        />
      )}
    </RequireRole>
  );
}

function RequestCard({ request: r, onApprove, onReject, onWithdraw }: { request: ApprovalRequest; onApprove: () => void; onReject: () => void; onWithdraw: () => void }) {
  const Icon = KIND[r.kind].icon;
  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", r.kind === "DELETE" ? "bg-red-50 text-danger" : "bg-accent-soft text-accent")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-ink">{r.title}</p>
          <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {KIND[r.kind].label} · asked by {r.requestedBy.name} ({roleLabels[r.requestedBy.role] ?? r.requestedBy.role}) · {formatDateTime(r.createdAt)}
          {r.attachmentId && (
            <>
              {" · "}
              <a href={api.fileUrl(r.attachmentId)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                View attachment
              </a>
            </>
          )}
        </p>
        {r.reviewedBy && (
          <p className="mt-1 text-xs text-muted">
            {STATUS_LABEL[r.status]} by {r.reviewedBy.name}
            {r.reviewedAt ? ` · ${formatDateTime(r.reviewedAt)}` : ""}
            {r.reviewNote ? ` · “${r.reviewNote}”` : ""}
          </p>
        )}
      </div>
      {r.amount && <p className="shrink-0 text-lg font-semibold text-ink tabular-nums">{formatCurrency(r.amount)}</p>}
      {(r.canReview || r.canCancel) && (
        <div className="flex shrink-0 gap-2">
          {r.canReview && (
            <>
              <Button size="sm" variant="secondary" onClick={onReject}>
                <X className="size-4" /> Reject
              </Button>
              <Button size="sm" variant={r.kind === "DELETE" ? "danger" : "primary"} onClick={onApprove}>
                <Check className="size-4" /> {r.kind === "DELETE" ? "Approve delete" : "Approve"}
              </Button>
            </>
          )}
          {r.canCancel && (
            <Button size="sm" variant="ghost" onClick={onWithdraw}>
              <Undo2 className="size-4" /> Withdraw
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function ReviewModal({ request, action, onClose, onDone }: { request: ApprovalRequest; action: "approve" | "reject"; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useToast();
  const approving = action === "approve";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/approvals/${request.id}/${action}`, { note: note.trim() || undefined });
      notify(approving ? (request.kind === "DELETE" ? "Approved and deleted" : "Approved and recorded") : "Request rejected");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const effect =
    request.kind === "DELETE"
      ? "This permanently carries out the delete."
      : request.kind === "PAYROLL_PAYMENT"
        ? "The payroll is marked paid and locked."
        : "It is recorded now and counts in balances, totals and reports.";

  return (
    <Modal
      open
      title={approving ? "Approve this request?" : "Reject this request?"}
      description={request.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button variant={approving ? (request.kind === "DELETE" ? "danger" : "primary") : "danger"} loading={busy} onClick={() => void submit()}>
            {approving ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-muted">{approving ? effect : `Nothing is changed. ${request.requestedBy.name} sees your note.`}</p>
        <div>
          <label htmlFor="review-note" className="mb-1 block text-sm font-medium text-ink">
            Note {approving ? "(optional)" : "(recommended)"}
          </label>
          <Textarea id="review-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>
      </div>
    </Modal>
  );
}
