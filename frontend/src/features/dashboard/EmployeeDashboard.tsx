"use client";

import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, ClipboardCheck, Clock, ListTodo } from "@/components/ui/icons";
import Link from "next/link";
import { Alert, Badge, EmptyState, Spinner } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/Misc";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { STAGE_COLORS } from "./WorkCharts";
import { AreaTrend, Bars, ChartCard, Donut, HeroBanner, Kpi, PALETTE, percentChange, RankedBars } from "./PersonalCharts";

interface EmployeeDashboardData {
  employee: { name: string; designation: string | null };
  tasks: { todo: number; inProgress: number; inReview: number; open: number; overdue: number; dueThisWeek: number; doneThisMonth: number; doneLastMonth: number };
  hours: {
    thisMonth: number;
    lastMonth: number;
    daysLoggedThisMonth: number;
    daily: { date: string; hours: number }[];
    byClient: { name: string; hours: number }[];
    byType: { type: string; hours: number }[];
  };
  weeks: { week: string; completed: number; hours: number }[];
  myTasks: { id: string; title: string; status: string; priority: string; dueDate: string | null; overdue: boolean; client: { name: string } | null }[];
  upcomingEvents: { id: string; title: string; start: string; allDay: boolean; eventType: string | null; client: { name: string } | null }[];
  pendingRequests: number;
}

const hrs = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function EmployeeDashboard() {
  const dash = useAsync(() => api.get<EmployeeDashboardData>("/dashboard/me"), []);
  const d = dash.data;
  if (dash.error) return <Alert>{dash.error}</Alert>;
  if (!d) return <Spinner />;
  const firstName = d.employee.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <HeroBanner
        eyebrow={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting()}, ${firstName}`}
        subtitle={d.employee.designation ? `${d.employee.designation} · here's your work at a glance` : "Here's your work at a glance"}
        stats={[
          { label: "Open tasks", value: d.tasks.open },
          { label: "Hours this month", value: hrs(d.hours.thisMonth) },
          { label: "Done this month", value: d.tasks.doneThisMonth },
        ]}
      />

      {d.pendingRequests > 0 && (
        <Alert variant="info">
          {d.pendingRequests} of your delete request(s) are waiting for a manager.{" "}
          <Link href="/approvals" className="font-medium underline">
            View requests
          </Link>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Open tasks" value={d.tasks.open} hint="To do, in progress, in review" icon={ListTodo} tone="blue" />
        <Kpi label="Overdue" value={d.tasks.overdue} hint="Past their due date" icon={AlertTriangle} tone="red" alert={d.tasks.overdue > 0} />
        <Kpi label="Due in 7 days" value={d.tasks.dueThisWeek} hint="Plan these first" icon={CalendarClock} tone="violet" />
        <Kpi
          label="Hours this month"
          value={hrs(d.hours.thisMonth)}
          hint={`${d.hours.daysLoggedThisMonth} day(s) logged`}
          icon={Clock}
          tone="orange"
          delta={percentChange(d.hours.thisMonth, d.hours.lastMonth)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard title="Hours logged" subtitle="Last 14 days" className="xl:col-span-2" action={<Link href="/work-log" className="text-xs font-medium text-accent hover:underline">Log time</Link>}>
          <AreaTrend
            points={d.hours.daily.map((p) => ({ label: dayLabel(p.date), value: p.hours }))}
            unit="Hours"
            color={PALETTE[1]}
            ariaLabel={`Hours logged per day for the last 14 days, ${hrs(d.hours.daily.reduce((s, p) => s + p.hours, 0))} in total`}
          />
        </ChartCard>
        <ChartCard title="My tasks by stage" subtitle="Everything still open">
          <Donut
            centerLabel="open tasks"
            colors={STAGE_COLORS}
            emptyText="No open tasks. Nice work!"
            slices={[
              { label: "To do", value: d.tasks.todo },
              { label: "In progress", value: d.tasks.inProgress },
              { label: "In review", value: d.tasks.inReview },
            ]}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard title="Where my time went" subtitle="This month, by client">
          <Donut slices={d.hours.byClient.map((c) => ({ label: c.name, value: c.hours }))} centerLabel="hours" format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))} emptyText="No time logged this month yet" />
        </ChartCard>
        <ChartCard title="Type of work" subtitle="This month">
          <RankedBars items={d.hours.byType.map((t) => ({ label: humanize(t.type), value: t.hours }))} format={hrs} color={PALETTE[2]} />
        </ChartCard>
        <ChartCard title="Tasks completed" subtitle={`Per week · ${d.tasks.doneThisMonth} this month, ${d.tasks.doneLastMonth} last month`}>
          <Bars
            rows={d.weeks.map((w) => ({ label: dayLabel(w.week), completed: w.completed }))}
            series={[{ key: "completed", label: "Completed" }]}
            ariaLabel={`Tasks completed per week: ${d.weeks.map((w) => w.completed).join(", ")}`}
            height={200}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="My next tasks" subtitle="Overdue first, then by due date" action={<Link href="/tasks" className="text-xs font-medium text-accent hover:underline">Task board</Link>}>
          {d.myTasks.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="You're all caught up" description="Nothing open is assigned to you." />
          ) : (
            <ul className="-mx-2 divide-y divide-line">
              {d.myTasks.map((t) => (
                <li key={t.id}>
                  <Link href="/tasks" className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-page">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: t.status === "TODO" ? STAGE_COLORS[0] : t.status === "IN_PROGRESS" ? STAGE_COLORS[1] : STAGE_COLORS[2] }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{t.title}</p>
                      <p className="truncate text-xs text-muted">
                        {t.client?.name ?? "Internal"} · {humanize(t.priority)} priority
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={t.status} />
                      {t.dueDate && <span className={t.overdue ? "text-xs font-medium text-danger" : "text-xs text-muted"}>{t.overdue ? "Overdue · " : "Due "}{formatDate(t.dueDate)}</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="Coming up" subtitle="Your calendar for the next 7 days" action={<Link href="/calendar" className="text-xs font-medium text-accent hover:underline">Calendar</Link>}>
          {d.upcomingEvents.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Events you're invited to will show here." />
          ) : (
            <ul className="space-y-2">
              {d.upcomingEvents.map((e) => {
                const date = new Date(e.start);
                return (
                  <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <span className="text-[10px] font-semibold uppercase">{date.toLocaleDateString("en-IN", { month: "short", ...(e.allDay ? { timeZone: "UTC" } : {}) })}</span>
                      <span className="text-base leading-none font-bold">{date.toLocaleDateString("en-IN", { day: "numeric", ...(e.allDay ? { timeZone: "UTC" } : {}) })}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{e.title}</p>
                      <p className="truncate text-xs text-muted">
                        {e.allDay ? "All day" : date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                        {e.client ? ` · ${e.client.name}` : ""}
                      </p>
                    </div>
                    {e.eventType && <Badge>{humanize(e.eventType)}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ClipboardCheck className="size-3.5" aria-hidden /> Only your own tasks and time are shown here.
      </p>
    </div>
  );
}
