"use client";

import { LogOut, Menu, PanelLeftClose, X } from "@/components/ui/icons";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { api } from "@/lib/api";
import { roleLabels } from "@/lib/labels";
import { type NavItem, navFor, navSectionsFor } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "sidebar-collapsed";

/** One sidebar row: solid orange pill when active, quiet grey otherwise. */
function NavLink({ item, active, collapsed, label, badge }: { item: NavItem; active: boolean; collapsed: boolean; label: string; badge?: number }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
          active ? "bg-accent font-semibold text-white shadow-sm shadow-orange-500/30" : "font-medium text-slate-700 hover:bg-accent-soft hover:text-ink",
          collapsed && "lg:justify-center lg:px-0",
        )}
      >
        <span className="relative shrink-0">
          <Icon className={cn("size-[18px]", active ? "text-white" : "text-slate-500")} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
          {badge ? <span className={cn("absolute -top-1 -right-1 hidden size-2 rounded-full bg-danger ring-2 ring-card", collapsed && "lg:block")} aria-hidden /> : null}
        </span>
        <span className={cn("truncate", collapsed && "lg:hidden")}>{label}</span>
        {badge ? (
          <span
            className={cn("ml-auto rounded-full px-1.5 py-0.5 text-[11px] leading-none font-semibold tabular-nums", active ? "bg-white text-accent" : "bg-danger text-white", collapsed && "lg:hidden")}
            aria-label={`${badge} waiting`}
          >
            {badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** The "TX" mark, cropped from the full logo, on a soft orange tile. */
function BrandMark() {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-soft ring-1 ring-orange-100">
      <span className="block w-8 overflow-hidden">
        <Image src="/images/logo.png" alt="" width={757} height={232} priority className="-ml-[5px] h-8 w-auto max-w-none" />
      </span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = navFor(user.role);
  const sections = navSectionsFor(user.role);
  const employeeLabels: Record<string, string> = { "/payroll": "My Payslips", "/work-log": "My Work Log" };
  const navLabel = (item: NavItem) => (user.role === "EMPLOYEE" ? (employeeLabels[item.href] ?? item.label) : item.label);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore a per-browser preference after hydration
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile drawer after navigating
    setMobileOpen(false);
  }, [pathname]);

  // Requests waiting for this user's approval, refreshed on navigation, every minute and after a review.
  const [toReview, setToReview] = useState(0);
  const watchesApprovals = items.some((item) => item.href === "/approvals");
  useEffect(() => {
    if (!watchesApprovals) return;
    let cancelled = false;
    const load = () =>
      api.get<{ toReview: number }>("/approvals/counts").then(
        (c) => !cancelled && setToReview(c.toReview),
        () => undefined,
      );
    void load();
    const timer = setInterval(load, 60_000);
    window.addEventListener("approvals:changed", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("approvals:changed", load);
    };
  }, [pathname, watchesApprovals]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !value;
    });
  }

  const current = items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      {mobileOpen && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-card transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          collapsed ? "lg:w-[76px]" : "lg:w-64",
          mobileOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full",
        )}
      >
        {/* Brand + collapse toggle */}
        <div className={cn("flex h-[72px] shrink-0 items-center gap-3 border-b border-line px-4", collapsed && "lg:justify-center lg:px-0")}>
          {/* Full logo; the PNG's built-in side padding is trimmed with a negative margin inside a clipped box. */}
          <Link href="/" aria-label="Tecnovex Digital Solutions – home" className={cn("flex h-14 min-w-0 flex-1 items-center overflow-hidden", collapsed && "lg:hidden")}>
            <Image src="/images/logo.png" alt="Tecnovex Digital Solutions" width={757} height={232} priority className="-ml-2 h-14 w-auto max-w-none" />
          </Link>
          {/* Collapsed: the "TX" mark doubles as the expand button so the brand stays visible. */}
          <button
            onClick={toggleCollapsed}
            className={cn("hidden shrink-0 rounded-lg text-slate-500 hover:text-ink lg:block", collapsed ? "rounded-xl hover:ring-2 hover:ring-accent/40" : "p-1.5 hover:bg-page")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <BrandMark /> : <PanelLeftClose className="size-5" />}
          </button>
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-page lg:hidden" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
            <X className="size-5" />
          </button>
        </div>

        <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
          {sections.map((group, index) => (
            <div key={group.section} className={cn(index > 0 && "mt-5")}>
              <p className={cn("mb-2 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase", collapsed && "lg:hidden")}>
                {group.section === "System" ? "Account" : group.section}
              </p>
              {index > 0 && <div className={cn("mx-2 mb-3 hidden border-t border-line", collapsed && "lg:block")} aria-hidden />}
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={current?.href === item.href}
                    collapsed={collapsed}
                    label={navLabel(item)}
                    badge={item.href === "/approvals" ? toReview : undefined}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Signed-in user */}
        <div className="shrink-0 border-t border-line p-3">
          <div className={cn("flex items-center gap-3 rounded-xl bg-page px-3 py-2.5", collapsed && "lg:flex-col lg:gap-2 lg:bg-transparent lg:px-0 lg:py-0")}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white" title={collapsed ? `${user.name} · ${roleLabels[user.role]}` : undefined} aria-hidden>
              {initials}
            </span>
            <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
              <span className="block truncate text-sm leading-tight font-semibold text-ink">{user.name}</span>
              <span className="block truncate text-xs leading-tight text-muted">{roleLabels[user.role]}</span>
            </span>
            <button onClick={() => void logout()} className="rounded-lg p-1.5 text-slate-500 hover:bg-card hover:text-danger" title="Sign out" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
          <p className={cn("mt-2 text-center text-[11px] text-slate-400", collapsed && "lg:hidden")}>Powered by Tecnovex</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-card px-4 sm:px-6">
          <button className="rounded-lg p-1.5 text-muted hover:bg-page lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </button>
          <p className="truncate text-sm font-semibold text-ink">{current?.label ?? "Tecnovex Digital"}</p>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
