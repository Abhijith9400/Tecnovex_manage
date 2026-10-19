"use client";

import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, Eye, ImageOff, ListTodo, type IconComponent, Megaphone, PenTool } from "@/components/ui/icons";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert, Badge, EmptyState, Spinner } from "@/components/ui/Feedback";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { StackedBars, STAGE_COLORS, StageDonut, TaskTrendChart, type TrendPoint } from "./WorkCharts";

interface WorkDashboardData {
  tasks: { todo: number; inProgress: number; inReview: number; open: number; overdue: number; dueThisWeek: number; completedInPeriod: number };
  team: { employeeId: string; name: string; todo: number; inProgress: number; inReview: number; total: number; overdue: number }[];
  trend: TrendPoint[];
  creatives: {
    draft: number;
    approved: number;
    published: number;
    pastPublishDate: number;
    dueThisWeek: number;
    byClient: { clientId: string; name: string; draft: number; approved: number }[];
  };
  activeCampaigns: number;
  overdueTasks: {
    id: string;
    title: string;
    dueDate: string;
    priority: string;
    status: string;
    daysOverdue: number;
    assignee: { fullName: string };
    client: { name: string } | null;
  }[];
  upcoming: { id: string; source: string; title: string; start: string; allDay: boolean; eventType: string | null; client: { name: string } | null; href: string | null }[];
}

const TASK_SERIES = [
  { key: "todo", label: "To do", color: STAGE_COLORS[0] },
  { key: "inProgress", label: "In progress", color: STAGE_COLORS[1] },
  { key: "inReview", label: "In review", color: STAGE_COLORS[2] },
];

const CREATIVE_SERIES = [
  { key: "draft", label: "Draft (not done)", color: STAGE_COLORS[0] },
  { key: "approved", label: "Approved, not published", color: STAGE_COLORS[1] },
];

function Kpi({ label, value, hint, icon: Icon, href, alert }: { label: string; value: number; hint: string; icon: IconComponent; href: string; alert?: boolean }) {
  const warn = alert && value > 0;
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md",
        warn ? "border-red-200 bg-red-50/60 hover:border-red-300" : "border-line hover:border-orange-200",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", warn ? "bg-red-100 text-danger" : "bg-accent-soft text-accent")}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", warn ? "text-danger" : "text-ink")}>{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </Link>
  );
}

function priorityTone(priority: string) {
  return priority === "URGENT" || priority === "HIGH" ? "danger" : priority === "MEDIUM" ? "warning" : "neutral";
}

function whenLabel(start: string, allDay: boolean) {
  const date = new Date(start);
  const day = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(allDay ? { timeZone: "UTC" } : {}) });
  return allDay ? day : `${day} · ${date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

export function WorkDashboard({ range }: { range: { from: string; to: string } }) {
  const work = useAsync(() => api.get<WorkDashboardData>("/dashboard/work", range), [range.from, range.to]);
  const d = work.data;

  if (work.error) return <Alert>{work.error}</Alert>;
  if (!d) return <Spinner />;

  return (
    <div className={cn("min-w-0 space-y-6", work.loading && "opacity-60")}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Open tasks" value={d.tasks.open} hint="To do, in progress and in review" icon={ListTodo} href="/tasks" />
        <Kpi label="Overdue tasks" value={d.tasks.overdue} hint="Past due date and not done" icon={AlertTriangle} href="/tasks" alert />
        <Kpi label="Due in the next 7 days" value={d.tasks.dueThisWeek} hint="Open tasks with a due date this week" icon={CalendarClock} href="/tasks" />
        <Kpi label="Waiting for review" value={d.tasks.inReview} hint="Finished by the team, needs approval" icon={Eye} href="/tasks" />
        <Kpi label="Creatives not done" value={d.creatives.draft} hint="Still in draft" icon={PenTool} href="/creatives" />
        <Kpi label="Missed publish date" value={d.creatives.pastPublishDate} hint="Publish date passed, not published" icon={ImageOff} href="/creatives" alert />
        <Kpi label="Active ad campaigns" value={d.activeCampaigns} hint="Boosts and campaigns running now" icon={Megaphone} href="/ads" />
        <Kpi label="Tasks completed" value={d.tasks.completedInPeriod} hint="In the selected period" icon={CheckCircle2} href="/tasks" />
      </div>

      <div className="grid gap-6 xl:grid-cols-5 [&>*]:min-w-0">
        <Card className="xl:col-span-2">
          <CardHeader title="Open tasks by stage" description="Everything not yet done, as of today." />
          <div className="p-5">
            <StageDonut
              centerLabel="open tasks"
              slices={[
                { label: "To do", value: d.tasks.todo },
                { label: "In progress", value: d.tasks.inProgress },
                { label: "In review", value: d.tasks.inReview },
              ]}
            />
          </div>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Tasks created vs completed" description="Per week, last 8 weeks. Completed below created means work is piling up." />
          <div className="p-4">
            <TaskTrendChart points={d.trend} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5 [&>*]:min-w-0">
        <Card className="xl:col-span-3">
          <CardHeader title="Team workload" description="Open tasks per employee. Hover a bar to see overdue tasks." />
          <div className="p-4">
            {d.team.length === 0 ? (
              <EmptyState title="No open tasks" description="Assign work from the Tasks page." />
            ) : (
              <StackedBars
                rows={d.team.map((t) => ({ name: t.name, todo: t.todo, inProgress: t.inProgress, inReview: t.inReview, overdue: t.overdue }))}
                series={TASK_SERIES}
                ariaLabel={`Open tasks per employee: ${d.team.map((t) => `${t.name} ${t.total}`).join(", ")}`}
                extra={(row) => (Number(row.overdue) > 0 ? `${row.overdue} overdue` : "Nothing overdue")}
              />
            )}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Creatives pipeline" description="All creatives except archived." />
          <div className="p-5">
            <StageDonut
              centerLabel="creatives"
              slices={[
                { label: "Draft (not done)", value: d.creatives.draft },
                { label: "Approved", value: d.creatives.approved },
                { label: "Published", value: d.creatives.published },
              ]}
            />
            {d.creatives.dueThisWeek > 0 && (
              <p className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-xs text-orange-900">
                {d.creatives.dueThisWeek} creative(s) are due to be published in the next 7 days and are not published yet.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Pending creatives by client" description="Creatives not yet published, top 8 clients." action={<Link href="/creatives" className="text-xs text-accent hover:underline">Creative shelf</Link>} />
        <div className="p-4">
          {d.creatives.byClient.length === 0 ? (
            <EmptyState title="Nothing pending" description="Every creative is published or archived." />
          ) : (
            <StackedBars
              rows={d.creatives.byClient.map((c) => ({ name: c.name, draft: c.draft, approved: c.approved }))}
              series={CREATIVE_SERIES}
              ariaLabel={`Pending creatives by client: ${d.creatives.byClient.map((c) => `${c.name} ${c.draft + c.approved}`).join(", ")}`}
            />
          )}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title="Overdue tasks" description="Oldest first." action={<Link href="/tasks" className="text-xs text-accent hover:underline">Task board</Link>} />
          {d.overdueTasks.length === 0 ? (
            <EmptyState title="Nothing overdue" description="All open tasks are on schedule." />
          ) : (
            <ul className="divide-y divide-line">
              {d.overdueTasks.map((t) => (
                <li key={t.id}>
                  <Link href="/tasks" className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-page">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{t.title}</p>
                      <p className="truncate text-xs text-muted">
                        {t.assignee.fullName}
                        {t.client ? ` · ${t.client.name}` : ""} · {humanize(t.status)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="flex items-center gap-1 text-xs font-medium text-danger">
                        <AlertTriangle className="size-3.5" aria-hidden /> {t.daysOverdue}d late
                      </span>
                      <Badge tone={priorityTone(t.priority)}>{humanize(t.priority)}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Next 7 days" description="Calendar deadlines, shoots, posting dates and creatives to publish." action={<Link href="/calendar" className="text-xs text-accent hover:underline">Calendar</Link>} />
          {d.upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="Add deadlines and posting dates in the calendar." />
          ) : (
            <ul className="divide-y divide-line">
              {d.upcoming.map((e) => (
                <li key={e.id}>
                  <Link href={e.href ?? "/calendar"} className="flex items-center gap-3 px-5 py-3 hover:bg-page">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <CalendarDays className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{e.title}</p>
                      <p className="truncate text-xs text-muted">
                        {whenLabel(e.start, e.allDay)}
                        {e.client ? ` · ${e.client.name}` : ""}
                      </p>
                    </div>
                    <Badge>{e.source === "CREATIVE" ? "Creative" : humanize(e.eventType ?? "Event")}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
