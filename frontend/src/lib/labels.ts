/** Display labels and badge tones for API enums, shared by every module. */

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const ACRONYMS = new Set(["UPI", "GST", "PDF", "X"]);

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split("_")
    .map((word) => (ACRONYMS.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(" ");
}

export const paymentMethods = ["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "CARD", "OTHER"] as const;

export const statusTone: Record<string, Tone> = {
  // clients
  LEAD: "info",
  ACTIVE: "success",
  ON_HOLD: "warning",
  INACTIVE: "neutral",
  // agreements
  DRAFT: "neutral",
  SENT: "info",
  SIGNED: "success",
  EXPIRED: "danger",
  TERMINATED: "neutral",
  // projects
  PLANNED: "info",
  IN_PROGRESS: "accent",
  COMPLETED: "success",
  CANCELLED: "neutral",
  // creatives
  APPROVED: "info",
  PUBLISHED: "success",
  ARCHIVED: "neutral",
  // invoices
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  // payments
  RECORDED: "success",
  VOIDED: "danger",
  // payroll / employees
  PENDING: "warning",
  ON_LEAVE: "warning",
  RESIGNED: "neutral",
  // ad campaigns (PLANNED/ACTIVE/COMPLETED/CANCELLED share tones above)
  PAUSED: "warning",
  // tasks
  TODO: "neutral",
  IN_REVIEW: "info",
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
  // renewals
  DUE_SOON: "warning",
  OK: "success",
  NO_EXPIRY: "neutral",
};

export const roleLabels: Record<string, string> = {
  ADMIN: "Administrator",
  ACCOUNTANT: "Accountant",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
  CLIENT: "Client (portal)",
};

export function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function periodLabel(period: string | null | undefined) {
  if (!period) return "—";
  const [year, month] = period.split("-").map(Number);
  return monthLabel(year, month);
}

export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** ISO date from the API → value for <input type="date">. */
export function dateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
