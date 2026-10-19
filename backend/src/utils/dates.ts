/** Date-only values are stored as UTC midnight. These helpers keep all period maths in UTC. */

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Last day of the month (inclusive, date-only). */
export function monthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

export function parsePeriod(period: string): { year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) throw new RangeError(`Invalid period "${period}", expected YYYY-MM`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function formatPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function periodLabel(year: number, month: number): string {
  return monthStart(year, month).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Indian financial year label (April-March), e.g. 2026-27. */
export function financialYear(date: Date): string {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function toDateString(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function formatDisplayDate(date: Date | null | undefined): string {
  return date ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "-";
}
