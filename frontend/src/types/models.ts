/** Shapes returned by the API. Money and decimals arrive as strings; dates as ISO strings. */

export type Role = "ADMIN" | "ACCOUNTANT" | "MANAGER" | "EMPLOYEE" | "CLIENT";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
  clientId: string | null;
}

export interface FileInfo {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string;
}

export type PaymentMethod = "BANK_TRANSFER" | "UPI" | "CASH" | "CHEQUE" | "CARD" | "OTHER";

export interface CompanySettings {
  legalName: string;
  tradingName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  pan: string | null;
  isGstRegistered: boolean;
  gstin: string | null;
  taxLabel: string;
  defaultTaxRate: string;
  splitTaxOnInvoice: boolean;
  otherTaxInfo: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankBranch: string | null;
  upiId: string | null;
  currency: string;
  invoicePrefix: string;
  invoiceNumberPadding: number;
  invoiceUseFinancialYear: boolean;
  receiptPrefix: string;
  defaultPaymentTermsDays: number;
  paymentTermsText: string | null;
  invoiceNotes: string | null;
  activeTemplateId: string | null;
  logo: FileInfo | null;
}

export type InvoiceLayout = "CLASSIC" | "MODERN" | "MINIMAL";

export interface InvoiceTemplate {
  id: string;
  name: string;
  layout: InvoiceLayout;
  primaryColor: string;
  accentColor: string;
  headerText: string | null;
  footerText: string | null;
  termsText: string | null;
  showLogo: boolean;
  showBankDetails: boolean;
  showSignature: boolean;
  signatureLabel: string;
  signature: FileInfo | null;
  reference: FileInfo | null;
}

export interface Category {
  id: string;
  type: "EXPENSE" | "INCOME";
  name: string;
  isActive: boolean;
}

export interface UserAccount extends AuthUser {
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  employee: { id: string; fullName: string; employeeCode: string } | null;
  client: { id: string; name: string } | null;
}

export type ClientStatus = "LEAD" | "ACTIVE" | "ON_HOLD" | "INACTIVE";
export type BillingType = "RETAINER" | "PROJECT";
export type BillingCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "ONE_TIME";

export interface Service {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  sacCode: string | null;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  isRecurring: boolean;
  isActive: boolean;
}

export interface Client {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  pan: string | null;
  gstin: string | null;
  billingType: BillingType;
  monthlyRetainer: string | null;
  projectPrice: string | null;
  billingCycle: BillingCycle;
  paymentTermsDays: number;
  status: ClientStatus;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  services?: Service[];
  _count?: { invoices: number; creatives: number; agreements: number; projects: number };
}

export interface ClientSummary {
  totalInvoiced: string;
  totalPaid: string;
  outstanding: string;
  overdueCount: number;
}

export interface ClientOption {
  id: string;
  name: string;
}

export type AgreementStatus = "DRAFT" | "SENT" | "SIGNED" | "ACTIVE" | "EXPIRED" | "TERMINATED";

export interface Agreement {
  id: string;
  clientId: string;
  client?: ClientOption;
  title: string;
  reference: string | null;
  effectiveDate: string;
  expiryDate: string | null;
  contractValue: string | null;
  status: AgreementStatus;
  scopeOfWork: string | null;
  monthlyDeliverables: string | null;
  postsPerMonth: number | null;
  carouselsPerMonth: number | null;
  reelsPerMonth: number | null;
  revisionLimit: number | null;
  exclusions: string | null;
  paymentTerms: string | null;
  renewalReminderDays: number;
  notes: string | null;
  archivedAt: string | null;
  documents: (FileInfo & { label: string | null })[];
  renewal?: { daysToExpiry: number | null; state: "NO_EXPIRY" | "OK" | "DUE_SOON" | "EXPIRED" };
}

export type ProjectStatus = "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED";

export interface Project {
  id: string;
  clientId: string;
  client?: ClientOption;
  agreementId: string | null;
  agreement?: { id: string; title: string } | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  budget: string | null;
  _count?: { creatives: number };
}

export type CreativeType = "POSTER" | "CAROUSEL" | "VIDEO" | "REEL" | "STORY" | "OTHER";
export type CreativePlatform = "INSTAGRAM" | "FACEBOOK" | "LINKEDIN" | "YOUTUBE" | "X" | "WEBSITE" | "OTHER";
export type CreativeStatus = "DRAFT" | "APPROVED" | "PUBLISHED" | "ARCHIVED";

export interface Creative {
  id: string;
  clientId: string;
  client?: ClientOption;
  projectId: string | null;
  project?: { id: string; name: string } | null;
  title: string;
  campaign: string | null;
  contentType: CreativeType;
  platform: CreativePlatform;
  status: CreativeStatus;
  publishDate: string | null;
  caption: string | null;
  internalNotes: string | null;
  createdAt: string;
  uploadedBy?: { name: string } | null;
  files: FileInfo[];
  boosts?: CreativeBoost[];
  boostSummary?: { count: number; spend: string; impressions: number; results: number };
}

export interface CreativeBoost {
  id: string;
  name: string;
  platform: string;
  campaignType: string;
  status: string;
  startDate: string;
  endDate: string | null;
  spend: string;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  resultLabel: string | null;
}

export interface CreativeOption {
  id: string;
  title: string;
  contentType: CreativeType;
  status: CreativeStatus;
  campaign: string | null;
  createdAt: string;
  files: FileInfo[];
}

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

export interface InvoiceItem {
  id: string;
  serviceId: string | null;
  description: string;
  sacCode: string | null;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  lineSubtotal: string;
  taxableAmount: string;
  taxAmount: string;
  lineTotal: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string | null;
  clientId: string;
  client?: ClientOption;
  templateId: string | null;
  billingPeriod: string | null;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  currency: string;
  billToName: string;
  billToAddress: string | null;
  billToEmail: string | null;
  billToGstin: string | null;
  billToPan: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  notes: string | null;
  terms: string | null;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  revisedFromId: string | null;
  revisedBy?: { id: string; invoiceNumber: string | null } | null;
  revisedFrom?: { id: string; invoiceNumber: string | null } | null;
  items?: InvoiceItem[];
  payments?: Payment[];
}

export type PaymentStatus = "RECORDED" | "VOIDED";

export interface Payment {
  id: string;
  receiptNumber: string;
  clientId: string;
  client?: ClientOption;
  invoiceId: string | null;
  invoice?: { id: string; invoiceNumber: string | null } | null;
  paymentDate: string;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  status: PaymentStatus;
  voidedAt: string | null;
  voidReason: string | null;
  proof: FileInfo | null;
  recordedBy?: { name: string } | null;
  createdAt: string;
}

export type EmploymentStatus = "ACTIVE" | "ON_LEAVE" | "RESIGNED" | "TERMINATED";

export interface SalaryStructure {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  basic: string;
  allowances: string;
  otherEarnings: string;
  fixedDeductions: string;
  applyStatutory: boolean;
  notes: string | null;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  department: string | null;
  joiningDate: string;
  exitDate: string | null;
  status: EmploymentStatus;
  pan: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  currentSalary?: SalaryStructure | null;
  salaryStructures?: SalaryStructure[];
}

export type PayrollStatus = "PENDING" | "APPROVED" | "PAID";

export interface PayrollLine {
  id: string;
  type: "EARNING" | "DEDUCTION";
  label: string;
  amount: string;
}

export interface PayrollAdjustment {
  id: string;
  amount: string;
  reason: string;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  createdAt: string;
  createdBy?: { name: string } | null;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employee?: { id: string; fullName: string; employeeCode: string; designation: string | null };
  periodYear: number;
  periodMonth: number;
  grossEarnings: string;
  totalDeductions: string;
  netPay: string;
  adjustmentsTotal?: string;
  status: PayrollStatus;
  approvedAt: string | null;
  approvedBy?: { name: string } | null;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  notes: string | null;
  lines?: PayrollLine[];
  adjustments?: PayrollAdjustment[];
}

export interface StatutoryDeduction {
  id: string;
  name: string;
  basis: "PERCENT_OF_BASIC" | "PERCENT_OF_GROSS" | "FIXED";
  value: string;
  maxAmount: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface Expense {
  id: string;
  title: string;
  categoryId: string;
  category?: { id: string; name: string };
  amount: string;
  expenseDate: string;
  vendor: string | null;
  paymentMethod: PaymentMethod;
  reference: string | null;
  notes: string | null;
  receipt: FileInfo | null;
  createdBy?: { name: string } | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface IncomeEntry {
  id: string;
  description: string;
  categoryId: string;
  category?: { id: string; name: string };
  amount: string;
  incomeDate: string;
  source: string | null;
  paymentMethod: PaymentMethod;
  reference: string | null;
  notes: string | null;
  attachment: FileInfo | null;
  createdBy?: { name: string } | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
  user: { name: string } | null;
}

export type AdPlatform = "META" | "GOOGLE" | "YOUTUBE" | "LINKEDIN" | "X" | "OTHER";
export type AdCampaignType = "POST_BOOST" | "REEL_BOOST" | "STORY_BOOST" | "ADS_MANAGER_CAMPAIGN" | "LEAD_GENERATION" | "SEARCH_ADS" | "DISPLAY_ADS" | "VIDEO_ADS" | "OTHER";
export type AdCampaignStatus = "PLANNED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export interface AdMetrics {
  ctr: string | null;
  cpc: string | null;
  cpm: string | null;
  costPerResult: string | null;
  budgetUsed: string | null;
}

export interface AdCampaign {
  id: string;
  clientId: string;
  client?: ClientOption;
  projectId: string | null;
  creativeId: string | null;
  creative?: { id: string; title: string; contentType: CreativeType; files: FileInfo[] } | null;
  postUrl: string | null;
  name: string;
  platform: AdPlatform;
  campaignType: AdCampaignType;
  objective: string | null;
  status: AdCampaignStatus;
  startDate: string;
  endDate: string | null;
  budget: string | null;
  spend: string;
  paidFrom: "CLIENT_ACCOUNT" | "AGENCY_PAID";
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  resultLabel: string | null;
  externalId: string | null;
  notes: string | null;
  managedBy?: { name: string } | null;
  metrics: AdMetrics;
}

export type WorkTaskType =
  | "DESIGN"
  | "VIDEO_EDITING"
  | "CONTENT_WRITING"
  | "SOCIAL_MEDIA_MANAGEMENT"
  | "ADS_MANAGEMENT"
  | "PHOTOGRAPHY"
  | "STRATEGY"
  | "CLIENT_MEETING"
  | "REVISIONS"
  | "ADMIN"
  | "OTHER";

export interface WorkLogEntry {
  id: string;
  employeeId: string;
  employee?: { id: string; fullName: string; employeeCode: string };
  clientId: string | null;
  client?: ClientOption | null;
  workDate: string;
  minutes: number;
  hours: string;
  taskType: WorkTaskType;
  title: string;
  description: string | null;
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TaskComment {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string } | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  clientId: string | null;
  client: ClientOption | null;
  assigneeId: string;
  assignee: { id: string; fullName: string; employeeCode: string };
  assignedBy: { name: string } | null;
  taskType: WorkTaskType;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  estimatedHours: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  loggedHours: string;
  overdue: boolean;
  _count?: { comments: number };
  comments?: TaskComment[];
  workLogs?: { id: string; workDate: string; hours: string; title: string; employee: { fullName: string } }[];
  history?: TaskHistoryEntry[];
}

export interface TaskHistoryEntry {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  user: { name: string } | null;
  changes: { fields?: { field: string; from: string | null; to: string }[]; comment?: string; work?: string } | Record<string, { from: unknown; to: unknown }> | null;
}
