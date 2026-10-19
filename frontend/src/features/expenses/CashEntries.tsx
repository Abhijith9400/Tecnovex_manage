"use client";

import { Ban, Paperclip, Plus } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { DataTable, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/ui/DataTable";
import { Alert, Badge } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { CsvButton, DateRange, currentMonthRange } from "@/components/ui/Filters";
import { FileLink } from "@/components/ui/Misc";
import { FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { ReasonModal } from "@/components/ui/ReasonModal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, approvalMessage, errorMessage, isApprovalRequested } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { useAsync, useDebounced } from "@/lib/hooks";
import { humanize, paymentMethods, todayInput } from "@/lib/labels";
import { enumOptions, useCategories } from "@/lib/options";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Expense, FileInfo, IncomeEntry } from "@/types/models";
import type { PaginationMeta } from "@/types/api";

type Kind = "expense" | "income";
type Entry = Expense | IncomeEntry;

const config = {
  expense: {
    path: "/expenses",
    category: "EXPENSE" as const,
    titleField: "title",
    titleLabel: "Expense title",
    partyField: "vendor",
    partyLabel: "Vendor / payee",
    dateField: "expenseDate",
    fileField: "receipt",
    fileLabel: "Receipt",
    noun: "expense",
  },
  income: {
    path: "/income",
    category: "INCOME" as const,
    titleField: "description",
    titleLabel: "Description",
    partyField: "source",
    partyLabel: "Source",
    dateField: "incomeDate",
    fileField: "attachment",
    fileLabel: "Attachment",
    noun: "income entry",
  },
};

function read(entry: Entry, field: string): string {
  return String((entry as unknown as Record<string, unknown>)[field] ?? "");
}
function fileOf(entry: Entry): FileInfo | null {
  return "receipt" in entry ? entry.receipt : (entry as IncomeEntry).attachment;
}

export function CashEntries({ kind }: { kind: Kind }) {
  const c = config[kind];
  const categories = useCategories(c.category);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ ...currentMonthRange(), categoryId: "", paymentMethod: "", includeVoided: false });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [voiding, setVoiding] = useState<Entry | null>(null);
  const { hasRole } = useAuth();
  // Managers add expenses (for approval) but cannot edit or void them.
  const canChange = kind === "income" || hasRole(["ADMIN", "ACCOUNTANT"]);
  const debounced = useDebounced(search);
  const query = { ...filters, search: debounced };
  const entries = useAsync(() => api.list<Entry>(c.path, { ...query, page }), [JSON.stringify(query), page, c.path]);
  const meta = entries.data?.meta as (PaginationMeta & { sum?: string }) | undefined;

  function setFilter(patch: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={`Total for selected filters`} value={meta?.sum !== undefined ? formatCurrency(meta.sum) : "…"} hint="Excludes voided entries" />
        <StatCard label="Entries" value={meta?.total ?? "…"} />
      </div>
      <Card>
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={`Search ${c.titleLabel.toLowerCase()}, ${c.partyLabel.toLowerCase()}, reference…`}
          />
          <DateRange from={filters.from} to={filters.to} onChange={(r) => setFilter(r)} />
          <FilterSelect label="Category" value={filters.categoryId} onChange={(v) => setFilter({ categoryId: v })} options={(categories.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
          <FilterSelect label="Method" value={filters.paymentMethod} onChange={(v) => setFilter({ paymentMethod: v })} options={enumOptions(paymentMethods)} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={filters.includeVoided} onChange={(e) => setFilter({ includeVoided: e.target.checked })} className="size-4 accent-accent" /> Show voided
          </label>
          <div className="flex gap-2 sm:ml-auto">
            <CsvButton href={api.url(c.path, { ...query, format: "csv" })} />
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add {kind === "expense" ? "expense" : "income"}
            </Button>
          </div>
        </Toolbar>
        <DataTable
          rows={entries.data?.items}
          loading={entries.loading}
          error={entries.error}
          onRowClick={canChange ? (e) => !e.voidedAt && setEditing(e) : undefined}
          emptyTitle={`No ${kind === "expense" ? "expenses" : "income entries"} in this period`}
          columns={[
            { header: "Date", cell: (e) => formatDate(read(e, c.dateField)) },
            {
              header: c.titleLabel,
              cell: (e) => (
                <div className={e.voidedAt ? "text-muted line-through" : ""}>
                  <p className="flex items-center gap-1.5 font-medium">
                    {read(e, c.titleField)}
                    {fileOf(e) && <Paperclip className="size-3.5 text-muted" aria-label="Has attachment" />}
                  </p>
                  <p className="text-xs text-muted">{read(e, c.partyField) || "—"}</p>
                </div>
              ),
            },
            { header: "Category", cell: (e) => e.category?.name },
            { header: "Method", cell: (e) => humanize(e.paymentMethod) },
            { header: "Reference", cell: (e) => e.reference ?? "—" },
            { header: "Status", cell: (e) => (e.voidedAt ? <Badge tone="danger">Voided</Badge> : <Badge tone="success">Recorded</Badge>) },
            { header: "Amount", align: "right", cell: (e) => <span className={e.voidedAt ? "text-muted line-through" : "font-medium"}>{formatCurrency(e.amount)}</span> },
            {
              header: "",
              align: "right",
              cell: (e) =>
                !e.voidedAt &&
                canChange && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setVoiding(e);
                    }}
                    className="rounded p-1.5 text-muted hover:bg-page hover:text-danger"
                    aria-label="Void"
                    title="Void"
                  >
                    <Ban className="size-4" />
                  </button>
                ),
            },
          ]}
        />
        <Pagination meta={entries.data?.meta} onPage={setPage} />
      </Card>
      {editing && (
        <EntryModal
          kind={kind}
          entry={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            entries.reload();
          }}
        />
      )}
      {voiding && (
        <VoidEntry
          kind={kind}
          entry={voiding}
          onClose={() => setVoiding(null)}
          onVoided={() => {
            setVoiding(null);
            entries.reload();
          }}
        />
      )}
    </>
  );
}

function VoidEntry({ kind, entry, onClose, onVoided }: { kind: Kind; entry: Entry; onClose: () => void; onVoided: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const c = config[kind];
  return (
    <ReasonModal
      title={`Void this ${c.noun}?`}
      description={`${read(entry, c.titleField)} · ${formatCurrency(entry.amount)}. The record stays visible as Voided and is excluded from totals and reports.`}
      confirmLabel="Void"
      busy={busy}
      onClose={onClose}
      onConfirm={async (reason) => {
        setBusy(true);
        try {
          await api.post(`${c.path}/${entry.id}/void`, { reason });
          notify("Entry voided");
          onVoided();
        } catch (error) {
          notify(errorMessage(error), "error");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function EntryModal({ kind, entry, onClose, onSaved }: { kind: Kind; entry: Entry | null; onClose: () => void; onSaved: () => void }) {
  const c = config[kind];
  const { notify } = useToast();
  const categories = useCategories(c.category);
  const [file, setFile] = useState<File | null>(null);
  const defaults = { [c.titleField]: "", categoryId: "", amount: "", [c.dateField]: todayInput(), [c.partyField]: "", paymentMethod: "BANK_TRANSFER", reference: "", notes: "" } as Record<string, string>;
  const form = useForm(toFormValues(defaults, entry as unknown as Record<string, unknown>));
  const existingFile = entry ? fileOf(entry) : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = new FormData();
    for (const [key, value] of Object.entries(form.values)) body.append(key, String(value));
    if (file) body.append(c.fileField, file);
    const saved = await form.submit(() => (entry ? api.put(`${c.path}/${entry.id}`, body) : api.post(c.path, body)));
    if (saved) {
      notify(isApprovalRequested(saved) ? `${approvalMessage(saved)}. It will count once approved.` : entry ? "Entry updated" : "Entry recorded");
      onSaved();
    }
  }

  return (
    <Modal
      open
      title={entry ? `Edit ${c.noun}` : kind === "expense" ? "Add expense" : "Add other income"}
      description={kind === "income" ? "Only income NOT received through client invoice payments. Record client payments under Payments." : undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="entry-form" loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="entry-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <TextField form={form} name={c.titleField} label={c.titleLabel} required />
        <FormGrid>
          <SelectField
            form={form}
            name="categoryId"
            label="Category"
            required
            placeholder="Choose a category"
            options={(categories.data ?? []).filter((x) => x.isActive || x.id === form.values.categoryId).map((x) => ({ value: x.id, label: x.name }))}
          />
          <MoneyField form={form} name="amount" label="Amount" required />
          <TextField form={form} name={c.dateField} label="Date" type="date" required />
          <TextField form={form} name={c.partyField} label={c.partyLabel} />
          <SelectField form={form} name="paymentMethod" label="Payment method" options={enumOptions(paymentMethods)} />
          <TextField form={form} name="reference" label="Transaction reference" />
        </FormGrid>
        <TextAreaField form={form} name="notes" label="Notes" rows={2} />
        {existingFile && !file && <FileLink file={existingFile} />}
        <Field label={existingFile ? `Replace ${c.fileLabel.toLowerCase()}` : c.fileLabel} hint="PDF, JPG, PNG or WEBP up to 10 MB.">
          {(props) => (
            <input
              {...props}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-page file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
