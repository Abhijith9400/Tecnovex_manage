import { FileCategory, Role } from "../generated/prisma/enums";

const { ADMIN, ACCOUNTANT, MANAGER, EMPLOYEE } = Role;

/**
 * Who may use each area of the API.
 * - MANAGER: everything an admin can do, except editing/voiding payments and expenses. Payments, expenses and
 *   payroll payouts a manager enters wait for admin approval (see approval.service).
 * - EMPLOYEE: all work areas (clients, creatives, tasks, calendar, ads, work log). Deletes become requests that a
 *   manager or admin approves. No access to money, except their own payslips (checked in the payroll service).
 */
export const access = {
  staff: [ADMIN, ACCOUNTANT, MANAGER],
  /** Client records (contact details). Services/pricing and money summaries use `clientServices` / `finance`. */
  clientsRead: [ADMIN, ACCOUNTANT, MANAGER, EMPLOYEE],
  clientsWrite: [ADMIN, ACCOUNTANT, MANAGER, EMPLOYEE],
  clientServices: [ADMIN, ACCOUNTANT, MANAGER],
  clientsArchive: [ADMIN, MANAGER, EMPLOYEE],
  operations: [ADMIN, MANAGER],
  /** Day-to-day work: creatives, tasks, calendar, ad campaigns. */
  work: [ADMIN, MANAGER, EMPLOYEE],
  agreementsRead: [ADMIN, MANAGER, ACCOUNTANT],
  /** Project names, so employees can file creatives under a project. */
  projectsRead: [ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE],
  /** Viewing money and adding entries (a manager's payments/expenses go for approval). */
  finance: [ADMIN, ACCOUNTANT, MANAGER],
  /** Editing or voiding recorded payments and expenses. */
  financeEdit: [ADMIN, ACCOUNTANT],
  /** Employees, payroll, user logins, company settings, audit log. */
  management: [ADMIN, MANAGER],
  admin: [ADMIN],
  workLog: [ADMIN, MANAGER, EMPLOYEE],
  adsRead: [ADMIN, ACCOUNTANT, MANAGER, EMPLOYEE],
  adsWrite: [ADMIN, MANAGER, EMPLOYEE],
  workReports: [ADMIN, MANAGER],
  /** Employees need the client list to tag their work log entries. */
  clientOptions: [ADMIN, ACCOUNTANT, MANAGER, EMPLOYEE],
  /** Approval queue: everyone who can raise or review a request. */
  approvals: [ADMIN, MANAGER, EMPLOYEE],
} satisfies Record<string, Role[]>;

export const fileAccess: Record<FileCategory, Role[]> = {
  // Staff who record ad boosts need to see the creative they boosted.
  CREATIVE: access.adsRead,
  AGREEMENT: access.agreementsRead,
  PAYMENT_PROOF: access.finance,
  EXPENSE_RECEIPT: access.finance,
  INCOME_ATTACHMENT: access.finance,
  BRANDING: access.staff,
  // Clients reach shared ones through the portal check in sendStoredFile.
  CONTENT_CALENDAR: access.adsRead,
};
