import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Briefcase,
  CreditCard,
  FileSignature,
  FileText,
  FolderDown,
  Images,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  type IconComponent,
  PiggyBank,
  Receipt,
  Settings,
  Users,
  Wallet,
} from "@/components/ui/icons";
import type { Role } from "@/types/models";

export type NavSection = "Overview" | "Clients & Work" | "Finance" | "Team" | "System";

export interface NavItem {
  label: string;
  href: string;
  icon: IconComponent;
  section: NavSection;
  /** Mirrors backend permissions; the API still enforces access on every request. */
  roles: Role[];
}

const ALL: Role[] = ["ADMIN", "ACCOUNTANT", "MANAGER", "EMPLOYEE", "CLIENT"];
const STAFF: Role[] = ["ADMIN", "ACCOUNTANT", "MANAGER"];
/** Money pages. Managers can add payments/expenses (they wait for admin approval) but not edit or void them. */
const FINANCE: Role[] = ["ADMIN", "ACCOUNTANT", "MANAGER"];
const OPERATIONS: Role[] = ["ADMIN", "MANAGER"];
/** Employees, payroll, user logins and company settings. */
const MANAGEMENT: Role[] = ["ADMIN", "MANAGER"];
/** Day-to-day work. Employees' deletes go to a manager for approval. */
const WORK: Role[] = ["ADMIN", "MANAGER", "EMPLOYEE"];
/** Work dashboard for admins/managers, money dashboard for admins/accountants/managers. */
const DASHBOARD: Role[] = ["ADMIN", "ACCOUNTANT", "MANAGER"];

/** Ordered by workflow: overview → client work → money in/out → team. Settings is pinned at the bottom. */
export const navItems: NavItem[] = [
  // First item = home page: everyone lands on their dashboard (personal for employees and clients).
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, section: "Overview", roles: ALL },
  { label: "Creatives & Calendar", href: "/portal", icon: FolderDown, section: "Overview", roles: ["CLIENT"] },
  { label: "Calendar", href: "/calendar", icon: CalendarDays, section: "Overview", roles: ["ADMIN", "ACCOUNTANT", "MANAGER", "EMPLOYEE"] },
  { label: "Approvals", href: "/approvals", icon: ClipboardCheck, section: "Overview", roles: WORK },
  { label: "Reports", href: "/reports", icon: BarChart3, section: "Overview", roles: STAFF },

  { label: "Clients", href: "/clients", icon: Briefcase, section: "Clients & Work", roles: [...STAFF, "EMPLOYEE"] },
  { label: "Agreements & Scope", href: "/agreements", icon: FileSignature, section: "Clients & Work", roles: STAFF },
  { label: "Creative Shelf", href: "/creatives", icon: Images, section: "Clients & Work", roles: WORK },
  { label: "Ad Campaigns", href: "/ads", icon: Megaphone, section: "Clients & Work", roles: [...STAFF, "EMPLOYEE"] },

  { label: "Invoices", href: "/invoices", icon: FileText, section: "Finance", roles: FINANCE },
  { label: "Payments", href: "/payments", icon: CreditCard, section: "Finance", roles: FINANCE },
  { label: "Other Income", href: "/income", icon: PiggyBank, section: "Finance", roles: FINANCE },
  { label: "Expenses", href: "/expenses", icon: Receipt, section: "Finance", roles: FINANCE },

  { label: "Tasks", href: "/tasks", icon: ListChecks, section: "Team", roles: WORK },
  { label: "Employees", href: "/employees", icon: Users, section: "Team", roles: MANAGEMENT },
  { label: "Work Log", href: "/work-log", icon: Clock, section: "Team", roles: ["ADMIN", "MANAGER", "EMPLOYEE"] },
  { label: "Payroll & Payslips", href: "/payroll", icon: Wallet, section: "Team", roles: ["ADMIN", "MANAGER", "EMPLOYEE"] },

  { label: "Settings", href: "/settings", icon: Settings, section: "System", roles: ALL },
];

export function navFor(role: Role) {
  return navItems.filter((item) => item.roles.includes(role));
}

/** Visible items grouped by section, in display order. Sections the role cannot see are omitted. */
export function navSectionsFor(role: Role) {
  const groups: { section: NavSection; items: NavItem[] }[] = [];
  for (const item of navFor(role)) {
    const group = groups.find((g) => g.section === item.section);
    if (group) group.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

export function homeFor(role: Role) {
  return navFor(role)[0]?.href ?? "/settings";
}

export const roleGroups = { ALL, STAFF, FINANCE, OPERATIONS, MANAGEMENT, WORK, DASHBOARD };
