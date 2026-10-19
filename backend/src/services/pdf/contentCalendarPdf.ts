/**
 * Client-facing content calendar PDF: a month grid (landscape A4) followed by a day-by-day list.
 * Only client-safe details are included (no internal meetings, design deadlines, spend or statuses).
 */
import PDFDocument from "pdfkit";
import { prisma } from "../../db/prisma";
import type { CalendarEventType } from "../../generated/prisma/enums";
import type { AuthUser } from "../../types/express";
import { listRange } from "../calendar.service";
import { loadImage, renderToBuffer, type Doc } from "./pdfUtils";

const TZ = "Asia/Kolkata";
const W = 841.89;
const H = 595.28;
const M = 36;
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const SOFT = "#F8FAFC";
const ACCENT = "#F97316";

/** Event types that are internal to the agency and never shown to the client. */
const INTERNAL_TYPES: CalendarEventType[] = ["MEETING", "DESIGN_DEADLINE"];

const TYPE_STYLE: Record<string, { label: string; color: string }> = {
  POST_SCHEDULE: { label: "Posting", color: "#16A34A" },
  CLIENT_SUBMISSION: { label: "For your review", color: "#7C3AED" },
  SHOOT: { label: "Shoot", color: "#2563EB" },
  CAMPAIGN_LAUNCH: { label: "Campaign launch", color: "#EA580C" },
  FESTIVAL: { label: "Festival / occasion", color: "#DB2777" },
  OTHER: { label: "Other", color: "#64748B" },
  CREATIVE: { label: "Content to publish", color: "#0D9488" },
  AD: { label: "Ad campaign starts", color: "#C2410C" },
};

export interface PlanEntry {
  date: string; // YYYY-MM-DD (India time)
  time: string | null; // "6:00 pm" for timed events
  type: keyof typeof TYPE_STYLE;
  title: string;
  detail: string | null;
}

const human = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const dateKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const timeOf = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d).toLowerCase();

/** Everything planned for one client in one month, in date order. */
export async function planFor(clientId: string, period: string): Promise<PlanEntry[]> {
  const [year, month] = period.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const inMonth = (key: string) => key.startsWith(period);
  // Calendar expansion of repeating events only needs a role that can see events.
  const system: AuthUser = { id: "system", email: "", name: "System", role: "ADMIN", employeeId: null, clientId: null };

  const [events, creatives, campaigns] = await Promise.all([
    listRange(system, { from: first.toISOString(), to: next.toISOString(), clientId, sources: ["EVENT"], types: undefined }),
    prisma.creativeAsset.findMany({ where: { clientId, status: { not: "ARCHIVED" }, publishDate: { gte: first, lt: next } }, orderBy: { publishDate: "asc" } }),
    prisma.adCampaign.findMany({ where: { clientId, status: { not: "CANCELLED" }, startDate: { gte: first, lt: next } }, orderBy: { startDate: "asc" } }),
  ]);

  const entries: PlanEntry[] = [];
  for (const e of events) {
    if (!e.eventType || INTERNAL_TYPES.includes(e.eventType as CalendarEventType)) continue;
    const start = new Date(e.start);
    const key = e.allDay ? e.start.slice(0, 10) : dateKey(start);
    if (!inMonth(key)) continue;
    const endKey = e.allDay ? e.end.slice(0, 10) : null;
    entries.push({
      date: key,
      time: e.allDay ? null : timeOf(start),
      type: e.eventType in TYPE_STYLE ? (e.eventType as keyof typeof TYPE_STYLE) : "OTHER",
      title: e.title,
      detail: [endKey && endKey !== key ? `until ${endKey.slice(8)}/${endKey.slice(5, 7)}` : null, e.location].filter(Boolean).join(" · ") || null,
    });
  }
  for (const c of creatives) {
    entries.push({ date: c.publishDate!.toISOString().slice(0, 10), time: null, type: "CREATIVE", title: c.title, detail: `${human(c.contentType)} · ${human(c.platform)}` });
  }
  for (const a of campaigns) {
    entries.push({ date: a.startDate.toISOString().slice(0, 10), time: null, type: "AD", title: a.name, detail: `${human(a.platform)} · ${human(a.campaignType)}` });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}

function monthTitle(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export async function renderContentCalendar(input: { clientId: string; clientName: string; period: string; title: string; notes: string | null }) {
  return renderPlan(input, await planFor(input.clientId, input.period));
}

async function renderPlan(input: { clientName: string; period: string; title: string; notes: string | null }, entries: PlanEntry[]) {
  const settings = await prisma.companySettings.findUnique({ where: { id: 1 }, include: { logoFile: true } });
  const agency = settings?.tradingName || settings?.legalName || "";
  const logo = await loadImage(settings?.logoFile?.storageKey, settings?.logoFile?.mimeType);
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: M, bottom: M, left: M, right: M }, bufferPages: true, info: { Title: input.title, Author: agency } });

  return renderToBuffer(doc, (d) => {
    const top = header(d, input, agency, logo);
    grid(d, input.period, entries, top);
    list(d, input, entries);
    footer(d, `${input.clientName} · ${monthTitle(input.period)}${agency ? ` · Prepared by ${agency}` : ""}`);
  });
}

function header(d: Doc, input: { clientName: string; period: string; title: string; notes: string | null }, agency: string, logo: Buffer | null) {
  let x = M;
  if (logo) {
    d.image(logo, M, M - 4, { fit: [90, 34] });
    x = M + 100;
  }
  d.font("Helvetica-Bold").fontSize(17).fillColor(INK).text(input.title, x, M - 2, { width: W - x - M - 160, lineBreak: false, ellipsis: true });
  d.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(`${input.clientName} · ${monthTitle(input.period)}`, x, M + 19, { width: W - x - M - 160, lineBreak: false, ellipsis: true });
  if (agency) d.font("Helvetica-Bold").fontSize(9).fillColor(ACCENT).text(agency, W - M - 200, M + 2, { width: 200, align: "right" });
  let y = M + 40;
  if (input.notes) {
    d.font("Helvetica").fontSize(8.5).fillColor(INK).text(input.notes, M, y, { width: W - M * 2, height: 24, ellipsis: true });
    y += 26;
  }
  return y;
}

function grid(d: Doc, period: string, entries: PlanEntry[], top: number) {
  const [year, month] = period.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Weeks start on Monday.
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const rows = Math.ceil((lead + daysInMonth) / 7);
  const legendH = 18;
  const headH = 16;
  const colW = (W - M * 2) / 7;
  const rowH = (H - M - 14 - top - headH - legendH) / rows;
  const byDay = new Map<number, PlanEntry[]>();
  for (const e of entries) byDay.set(Number(e.date.slice(8)), [...(byDay.get(Number(e.date.slice(8))) ?? []), e]);

  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((name, i) => {
    d.rect(M + i * colW, top, colW, headH).fill(INK);
    d.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF").text(name, M + i * colW, top + 4.5, { width: colW, align: "center" });
  });

  const lineH = 9.5;
  for (let cell = 0; cell < rows * 7; cell++) {
    const day = cell - lead + 1;
    const x = M + (cell % 7) * colW;
    const y = top + headH + Math.floor(cell / 7) * rowH;
    const inside = day >= 1 && day <= daysInMonth;
    d.rect(x, y, colW, rowH).fillAndStroke(inside ? "#FFFFFF" : SOFT, LINE);
    if (!inside) continue;
    const items = byDay.get(day) ?? [];
    d.font("Helvetica-Bold").fontSize(8.5).fillColor(items.length ? INK : MUTED).text(String(day), x + 4, y + 3);
    const capacity = Math.max(1, Math.floor((rowH - 16) / lineH));
    const shown = items.length > capacity ? items.slice(0, capacity - 1) : items;
    shown.forEach((e, i) => {
      const ly = y + 15 + i * lineH;
      d.circle(x + 6.5, ly + 3.2, 2.2).fill(TYPE_STYLE[e.type].color);
      d.font("Helvetica").fontSize(6.8).fillColor(INK).text(`${e.time ? `${e.time} ` : ""}${e.title}`, x + 11, ly, { width: colW - 14, height: lineH, lineBreak: false, ellipsis: true });
    });
    if (items.length > shown.length) {
      d.font("Helvetica-Oblique").fontSize(6.5).fillColor(MUTED).text(`+${items.length - shown.length} more (see list)`, x + 11, y + 15 + shown.length * lineH, { width: colW - 14, lineBreak: false });
    }
  }

  // Legend: only the types that appear this month.
  let lx = M;
  const ly = top + headH + rows * rowH + 6;
  const used = [...new Set(entries.map((e) => e.type))];
  if (used.length === 0) {
    d.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED).text("Nothing planned for this month yet.", M, ly);
    return;
  }
  for (const type of used) {
    const { label, color } = TYPE_STYLE[type];
    d.circle(lx + 3, ly + 3.5, 3).fill(color);
    d.font("Helvetica").fontSize(7.5).fillColor(INK).text(label, lx + 9, ly, { lineBreak: false });
    lx += 9 + d.widthOfString(label) + 16;
  }
}

function list(d: Doc, input: { period: string }, entries: PlanEntry[]) {
  if (entries.length === 0) return;
  d.addPage();
  const cols = [
    { label: "Date", w: 70 },
    { label: "Day", w: 45 },
    { label: "Time", w: 55 },
    { label: "Type", w: 110 },
    { label: "Title", w: 280 },
    { label: "Details", w: W - M * 2 - 560 },
  ];
  const headRow = (y: number) => {
    d.rect(M, y, W - M * 2, 18).fill(INK);
    let x = M;
    for (const c of cols) {
      d.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF").text(c.label, x + 6, y + 5.5, { width: c.w - 12, lineBreak: false });
      x += c.w;
    }
    return y + 18;
  };
  d.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(`Day-by-day plan · ${monthTitle(input.period)}`, M, M);
  let y = headRow(M + 24);
  entries.forEach((e, i) => {
    const date = new Date(`${e.date}T00:00:00Z`);
    const cells = [
      date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }),
      date.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
      e.time ?? "All day",
      TYPE_STYLE[e.type].label,
      e.title,
      e.detail ?? "",
    ];
    d.font("Helvetica").fontSize(8);
    const rowH = Math.max(18, ...cells.map((text, ci) => d.heightOfString(text, { width: cols[ci].w - 12 }) + 9));
    if (y + rowH > H - M - 14) {
      d.addPage();
      y = headRow(M);
    }
    if (i % 2 === 1) d.rect(M, y, W - M * 2, rowH).fill(SOFT);
    let x = M;
    cells.forEach((text, ci) => {
      if (ci === 3) d.circle(x + 9, y + 9, 2.6).fill(TYPE_STYLE[e.type].color);
      d.font(ci === 4 ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(ci === 5 ? MUTED : INK).text(text, x + (ci === 3 ? 15 : 6), y + 5, { width: cols[ci].w - (ci === 3 ? 21 : 12) });
      x += cols[ci].w;
    });
    d.moveTo(M, y + rowH).lineTo(W - M, y + rowH).lineWidth(0.5).strokeColor(LINE).stroke();
    y += rowH;
  });
}

function footer(d: Doc, text: string) {
  const range = d.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    d.switchToPage(i);
    const bottom = d.page.margins.bottom;
    d.page.margins.bottom = 0;
    const y = H - M + 10;
    d.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(text, M, y, { width: W - M * 2 - 80, lineBreak: false, ellipsis: true });
    d.text(`Page ${i - range.start + 1} of ${range.count}`, W - M - 80, y, { width: 80, align: "right", lineBreak: false });
    d.page.margins.bottom = bottom;
  }
}
