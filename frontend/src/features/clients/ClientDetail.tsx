"use client";

import { Archive, ArrowLeft, Pencil, RotateCcw } from "@/components/ui/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, Pagination } from "@/components/ui/DataTable";
import { Alert, Badge, EmptyState, Spinner } from "@/components/ui/Feedback";
import { DetailList, StatusBadge, Tabs } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { AdCampaignList } from "@/features/ads/AdCampaignList";
import { CalendarApp } from "@/features/calendar/CalendarApp";
import { ContentCalendarTab } from "@/features/contentCalendars/ContentCalendarTab";
import { AgreementList } from "@/features/agreements/AgreementList";
import { ProjectList } from "@/features/agreements/ProjectList";
import { useAuth } from "@/features/auth/AuthProvider";
import { CreativeGallery } from "@/features/creatives/CreativeGallery";
import { InvoiceList } from "@/features/invoices/InvoiceList";
import { PaymentList } from "@/features/payments/PaymentList";
import { api, approvalMessage, errorMessage, isApprovalRequested } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { roleGroups } from "@/lib/navigation";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type { Agreement, AuditEntry, Client, ClientSummary } from "@/types/models";
import { ClientFormModal } from "./ClientForm";
import { ServicesManager } from "./ServicesManager";

type TabKey = "overview" | "calendar" | "content" | "creatives" | "ads" | "agreements" | "scope" | "projects" | "invoices" | "payments" | "activity";

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const { notify } = useToast();
  const client = useAsync(() => api.get<Client>(`/clients/${id}`), [id]);
  const [tab, setTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  const finance = hasRole(roleGroups.FINANCE);
  const work = hasRole(roleGroups.WORK);
  // Employees see a client's work (details, calendar, creatives, ads) but not contracts, pricing or money.
  const staff = hasRole(roleGroups.STAFF);
  const archiveNeedsApproval = !staff;

  const tabs: { value: TabKey; label: string; show: boolean }[] = [
    { value: "overview", label: "Overview", show: true },
    { value: "calendar", label: "Calendar", show: true },
    { value: "content", label: "Content calendar", show: true },
    { value: "creatives", label: "Creatives", show: work },
    { value: "ads", label: "Ads", show: true },
    { value: "agreements", label: "Agreements", show: staff },
    { value: "scope", label: "Scope", show: staff },
    { value: "projects", label: "Projects", show: staff },
    { value: "invoices", label: "Invoices", show: finance },
    { value: "payments", label: "Payments", show: finance },
    { value: "activity", label: "Activity", show: staff },
  ];

  if (client.error) return <Alert>{client.error}</Alert>;
  if (!client.data) return <Spinner />;
  const c = client.data;
  const archived = Boolean(c.archivedAt);

  async function toggleArchive() {
    setBusy(true);
    try {
      const result = await api.post(`/clients/${c.id}/${archived ? "restore" : "archive"}`);
      notify(isApprovalRequested(result) ? approvalMessage(result) : archived ? "Client restored" : "Client archived");
      client.reload();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
      setConfirmArchive(false);
    }
  }

  return (
    <>
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Clients
      </Link>
      <PageHeader
        title={c.name}
        description={[c.contactPerson, c.email, c.phone].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <StatusBadge status={c.status} />
            {archived && <Badge>Archived</Badge>}
            {!archived && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            {work && (
              <Button variant="secondary" size="sm" onClick={() => (archived ? toggleArchive() : setConfirmArchive(true))} loading={busy}>
                {archived ? <RotateCcw className="size-4" /> : <Archive className="size-4" />} {archived ? "Restore" : archiveNeedsApproval ? "Request archive" : "Archive"}
              </Button>
            )}
          </>
        }
      />
      {archived && (
        <div className="mb-4">
          <Alert variant="info">This client is archived. Its history is kept, but new invoices, agreements and creatives cannot be added until it is restored.</Alert>
        </div>
      )}
      <Tabs tabs={tabs.filter((t) => t.show)} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="space-y-6">
          {finance && <FinanceSummary clientId={c.id} />}
          <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
            <Card>
              <CardHeader title="Details" />
              <div className="p-5">
                <DetailList
                  items={[
                    { label: "Contact person", value: c.contactPerson },
                    { label: "Email", value: c.email },
                    { label: "Phone", value: c.phone },
                    { label: "Address", value: [c.addressLine1, c.addressLine2, [c.city, c.state, c.postalCode].filter(Boolean).join(", "), c.country].filter(Boolean).join("\n") },
                    { label: "PAN", value: c.pan },
                    { label: "GSTIN", value: c.gstin },
                    { label: "Billing", value: `${humanize(c.billingType)} · ${humanize(c.billingCycle)}` },
                    ...(staff
                      ? [
                          { label: "Monthly retainer", value: c.monthlyRetainer ? formatCurrency(c.monthlyRetainer) : null },
                          { label: "Project price", value: c.projectPrice ? formatCurrency(c.projectPrice) : null },
                        ]
                      : []),
                    { label: "Payment terms", value: `${c.paymentTermsDays} days` },
                    { label: "Client since", value: formatDate(c.createdAt) },
                    { label: "Notes", value: c.notes },
                  ]}
                />
              </div>
            </Card>
            {staff && <ServicesManager clientId={c.id} services={c.services ?? []} canEdit={!archived} onChanged={client.reload} />}
          </div>
        </div>
      )}
      {tab === "creatives" && <CreativeGallery clientId={c.id} canUpload={!archived} />}
      {tab === "calendar" && <CalendarApp clientId={c.id} />}
      {tab === "content" && <ContentCalendarTab clientId={c.id} canAdd={!archived} />}
      {tab === "ads" && <AdCampaignList clientId={c.id} />}
      {tab === "agreements" && <AgreementList clientId={c.id} />}
      {tab === "scope" && <ScopeTab clientId={c.id} />}
      {tab === "projects" && <ProjectList clientId={c.id} />}
      {tab === "invoices" && <InvoiceList clientId={c.id} />}
      {tab === "payments" && <PaymentList clientId={c.id} />}
      {tab === "activity" && <ActivityTab clientId={c.id} />}

      {editing && (
        <ClientFormModal
          client={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            client.reload();
          }}
        />
      )}
      <ConfirmDialog
        open={confirmArchive}
        title={`Archive ${c.name}?`}
        message="Archived clients are hidden from lists and cannot receive new invoices. All history, invoices and payments are kept and the client can be restored."
        confirmLabel="Archive"
        loading={busy}
        onConfirm={toggleArchive}
        onCancel={() => setConfirmArchive(false)}
      />
    </>
  );
}

function FinanceSummary({ clientId }: { clientId: string }) {
  const summary = useAsync(() => api.get<ClientSummary>(`/clients/${clientId}/summary`), [clientId]);
  if (summary.error) return <Alert>{summary.error}</Alert>;
  const s = summary.data;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Total invoiced" value={s ? formatCurrency(s.totalInvoiced) : "…"} hint="Issued invoices, excluding cancelled" />
      <StatCard label="Total received" value={s ? formatCurrency(s.totalPaid) : "…"} hint="Recorded payments" />
      <StatCard label="Outstanding" value={s ? formatCurrency(s.outstanding) : "…"} />
      <StatCard label="Overdue invoices" value={s ? s.overdueCount : "…"} />
    </div>
  );
}

/** Scope of work from the client's agreements, newest first. */
function ScopeTab({ clientId }: { clientId: string }) {
  const agreements = useAsync(() => api.list<Agreement>("/agreements", { clientId, pageSize: 50 }), [clientId]);
  if (agreements.error) return <Alert>{agreements.error}</Alert>;
  if (!agreements.data) return <Spinner />;
  const items = agreements.data.items;
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState title="No scope defined" description="Add an agreement with its scope of work and monthly deliverables on the Agreements tab." />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {items.map((a) => (
        <Card key={a.id}>
          <CardHeader
            title={a.title}
            description={`${formatDate(a.effectiveDate)} – ${a.expiryDate ? formatDate(a.expiryDate) : "no expiry"}`}
            action={<StatusBadge status={a.status} />}
          />
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Posts / month" value={a.postsPerMonth ?? "—"} />
              <StatCard label="Carousels / month" value={a.carouselsPerMonth ?? "—"} />
              <StatCard label="Reels / month" value={a.reelsPerMonth ?? "—"} />
              <StatCard label="Revision limit" value={a.revisionLimit ?? "—"} />
            </div>
            <DetailList
              items={[
                { label: "Scope of work", value: a.scopeOfWork },
                { label: "Monthly deliverables", value: a.monthlyDeliverables },
                { label: "Exclusions", value: a.exclusions },
                { label: "Payment terms", value: a.paymentTerms },
              ]}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}

function ActivityTab({ clientId }: { clientId: string }) {
  const [page, setPage] = useState(1);
  const activity = useAsync(() => api.list<AuditEntry>(`/clients/${clientId}/activity`, { page }), [clientId, page]);
  return (
    <Card>
      <DataTable
        rows={activity.data?.items}
        loading={activity.loading}
        error={activity.error}
        emptyTitle="No activity yet"
        columns={[
          { header: "When", cell: (a) => <span className="whitespace-nowrap">{formatDateTime(a.createdAt)}</span> },
          { header: "Action", cell: (a) => <Badge>{humanize(a.action)}</Badge> },
          { header: "Details", cell: (a) => a.summary },
          { header: "By", cell: (a) => a.user?.name ?? "System" },
        ]}
      />
      <Pagination meta={activity.data?.meta} onPage={setPage} />
    </Card>
  );
}
