"use client";

import { CalendarRange, CheckCircle2, Download, Eye, Images, Megaphone, MousePointerClick, Rocket, Sparkles, Users } from "@/components/ui/icons";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Alert, Badge, EmptyState, Spinner } from "@/components/ui/Feedback";
import { monthName, PLAN_TYPES, type PlanEntry } from "@/features/contentCalendars/contentCalendar";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { humanize } from "@/lib/labels";
import { AreaTrend, Bars, ChartCard, Donut, formatCompact, HeroBanner, Kpi, monthShort, PALETTE } from "./PersonalCharts";

interface ClientDashboardData {
  client: { name: string };
  creatives: {
    delivered: number;
    published: number;
    readyToPublish: number;
    thisMonth: number;
    perMonth: Record<string, string | number>[];
    types: string[];
    byType: { type: string; count: number }[];
    byPlatform: { platform: string; count: number }[];
    recent: { id: string; title: string; contentType: string; platform: string; status: string; createdAt: string; thumbnailId: string | null }[];
  };
  ads: { active: number; total: number; impressions: number; reach: number; clicks: number; results: number; perMonth: { period: string; impressions: number; clicks: number }[] };
  upcoming: PlanEntry[];
  latestCalendar: { id: string; title: string; period: string } | null;
}

export function ClientDashboard() {
  const dash = useAsync(() => api.get<ClientDashboardData>("/portal/dashboard"), []);
  const profile = useAsync(() => api.get<{ agencyName: string }>("/portal/me"), []);
  const d = dash.data;
  if (dash.error) return <Alert>{dash.error}</Alert>;
  if (!d) return <Spinner />;
  const c = d.creatives;
  // Keep each content type on the same colour in every chart: order by overall count.
  const typeOrder = c.byType.map((t) => t.type).filter((t) => c.types.includes(t));

  return (
    <div className="space-y-6">
      <HeroBanner
        eyebrow={profile.data?.agencyName ? `Your workspace with ${profile.data.agencyName}` : "Your workspace"}
        title={`Welcome, ${d.client.name}`}
        subtitle="Everything we've created and planned for you, in one place."
        stats={[
          { label: "Creatives delivered", value: c.delivered },
          { label: "Published", value: c.published },
          ...(d.ads.total > 0 ? [{ label: "People reached", value: formatCompact(d.ads.reach) }] : []),
        ]}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Creatives delivered" value={c.delivered} hint="Approved and published" icon={Images} tone="blue" />
        <Kpi label="Published" value={c.published} hint="Live on your channels" icon={CheckCircle2} tone="green" />
        <Kpi label="Ready to publish" value={c.readyToPublish} hint="Approved, going out soon" icon={Rocket} tone="orange" />
        <Kpi label="New this month" value={c.thisMonth} hint="Delivered this month" icon={Sparkles} tone="violet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard title="Creatives delivered" subtitle="Last 6 months, by type" className="xl:col-span-2">
          <Bars
            rows={c.perMonth.map((row) => ({ ...row, label: monthShort(String(row.period)) }))}
            series={typeOrder.map((t) => ({ key: t, label: humanize(t) }))}
            ariaLabel={`Creatives delivered per month for the last 6 months`}
          />
        </ChartCard>
        <ChartCard title="Content mix" subtitle="All delivered creatives">
          <Donut slices={c.byType.map((t) => ({ label: humanize(t.type), value: t.count }))} centerLabel="creatives" />
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard title="Platforms" subtitle="Where your content goes">
          <Donut slices={c.byPlatform.map((p) => ({ label: humanize(p.platform), value: p.count }))} centerLabel="creatives" />
        </ChartCard>
        {d.ads.total > 0 ? (
          <ChartCard title="Ad campaigns" subtitle={`${d.ads.active} running now · ${d.ads.total} in total`} className="xl:col-span-2">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Impressions", value: d.ads.impressions, icon: Eye },
                { label: "People reached", value: d.ads.reach, icon: Users },
                { label: "Clicks", value: d.ads.clicks, icon: MousePointerClick },
                { label: "Results", value: d.ads.results, icon: Megaphone },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-page p-3">
                  <s.icon className="size-4 text-accent" aria-hidden />
                  <p className="mt-1 text-lg font-semibold text-ink tabular-nums">{formatCompact(s.value)}</p>
                  <p className="text-xs text-muted">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="mb-1 text-xs font-medium text-muted">Impressions by campaign start month</p>
            <AreaTrend
              points={d.ads.perMonth.map((m) => ({ label: monthShort(m.period), value: m.impressions }))}
              unit="Impressions"
              color={PALETTE[0]}
              height={160}
              ariaLabel={`Ad impressions per month for the last 6 months, ${d.ads.impressions.toLocaleString("en-IN")} in total`}
            />
          </ChartCard>
        ) : (
          <ChartCard title="Latest creatives" subtitle="Newest work delivered to you" className="xl:col-span-2" action={<Link href="/portal" className="text-xs font-medium text-accent hover:underline">See all</Link>}>
            <RecentGrid items={c.recent} />
          </ChartCard>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard title="Coming up" subtitle="Your next planned posts and dates" className="xl:col-span-2">
          {d.upcoming.length === 0 ? (
            <EmptyState icon={CalendarRange} title="Nothing scheduled yet" description="Planned posting dates will appear here." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.upcoming.map((e, i) => {
                const style = PLAN_TYPES[e.type] ?? PLAN_TYPES.OTHER;
                const date = new Date(`${e.date}T00:00:00Z`);
                return (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg text-white" style={{ background: style.color }}>
                      <span className="text-[10px] font-semibold uppercase">{date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</span>
                      <span className="text-base leading-none font-bold">{date.getUTCDate()}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{e.title}</p>
                      <p className="truncate text-xs text-muted">
                        {style.label}
                        {e.time ? ` · ${e.time}` : ""}
                        {e.detail ? ` · ${e.detail}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="Content calendar" subtitle="Your latest monthly plan">
          {d.latestCalendar ? (
            <div className="flex h-full flex-col">
              <div className="rounded-xl bg-ink p-4 text-white">
                <p className="text-xs font-semibold tracking-wide text-orange-300 uppercase">{monthName(d.latestCalendar.period)}</p>
                <p className="mt-1 font-semibold">{d.latestCalendar.title}</p>
              </div>
              <div className="mt-4 flex gap-2">
                <a href={api.url(`/portal/content-calendars/${d.latestCalendar.id}/file`)} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="secondary" className="w-full">
                    <Eye className="size-4" /> View
                  </Button>
                </a>
                <a href={api.url(`/portal/content-calendars/${d.latestCalendar.id}/file`, { download: "true" })} className="flex-1">
                  <Button className="w-full">
                    <Download className="size-4" /> Download
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <EmptyState icon={CalendarRange} title="No calendar shared yet" />
          )}
        </ChartCard>
      </div>

      {d.ads.total > 0 && (
        <ChartCard title="Latest creatives" subtitle="Newest work delivered to you" action={<Link href="/portal" className="text-xs font-medium text-accent hover:underline">See all</Link>}>
          <RecentGrid items={c.recent} />
        </ChartCard>
      )}
    </div>
  );
}

function RecentGrid({ items }: { items: ClientDashboardData["creatives"]["recent"] }) {
  if (items.length === 0) return <EmptyState icon={Images} title="No creatives yet" />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <Link key={item.id} href="/portal" className="group overflow-hidden rounded-xl border border-line">
          <div className="aspect-square overflow-hidden bg-page">
            {item.thumbnailId ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated API file, not a static asset
              <img src={api.fileUrl(item.thumbnailId)} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
            ) : (
              <div className="flex size-full items-center justify-center text-muted">
                <Images className="size-8" aria-hidden />
              </div>
            )}
          </div>
          <div className="p-2.5">
            <p className="truncate text-sm font-medium text-ink">{item.title}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <Badge tone={item.status === "PUBLISHED" ? "success" : "accent"}>{item.status === "PUBLISHED" ? "Published" : "Ready"}</Badge>
              <span className="truncate text-xs text-muted">{humanize(item.contentType)}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
