/** Expands a repeating event into concrete occurrences inside a time window. Pure, so it is unit-tested. */

export type Frequency = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurringEvent {
  startAt: Date;
  endAt: Date;
  recurrence: Frequency;
  recurrenceInterval: number;
  /** Last date (inclusive) a series may start on. */
  recurrenceUntil: Date | null;
  /** YYYY-MM-DD occurrence dates removed from the series. */
  excludedDates: string[];
}

const DAY = 86_400_000;
const MAX_OCCURRENCES = 2000;

function addMonthsKeepingDay(date: Date, months: number): Date | null {
  const result = new Date(date);
  const day = date.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  // Months without that day (e.g. 31 Feb) are skipped, like Google Calendar.
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  if (day > lastDay) return null;
  result.setUTCDate(day);
  return result;
}

/** nth occurrence start (n = 0 is the original), or null if that occurrence does not exist. */
function nthStart(event: RecurringEvent, n: number): Date | null {
  const step = Math.max(1, event.recurrenceInterval);
  switch (event.recurrence) {
    case "DAILY":
      return new Date(event.startAt.getTime() + n * step * DAY);
    case "WEEKLY":
      return new Date(event.startAt.getTime() + n * step * 7 * DAY);
    case "MONTHLY":
      return addMonthsKeepingDay(event.startAt, n * step);
    case "YEARLY":
      return addMonthsKeepingDay(event.startAt, n * step * 12);
    default:
      return n === 0 ? event.startAt : null;
  }
}

/**
 * Occurrences that overlap [from, to). The original duration is kept for every occurrence.
 * `dateKey` (YYYY-MM-DD of the occurrence start, UTC) identifies an occurrence for exclusions.
 */
export function expandOccurrences(event: RecurringEvent, from: Date, to: Date): { start: Date; end: Date; dateKey: string }[] {
  const duration = event.endAt.getTime() - event.startAt.getTime();
  const until = event.recurrenceUntil ? new Date(event.recurrenceUntil.getTime() + DAY) : null;
  const excluded = new Set(event.excludedDates);
  const result: { start: Date; end: Date; dateKey: string }[] = [];

  for (let n = 0, misses = 0; n < MAX_OCCURRENCES * 4 && result.length < MAX_OCCURRENCES; n++) {
    const start = nthStart(event, n);
    if (start === null) {
      if (event.recurrence === "NONE") break;
      if (++misses > 48) break; // safety for impossible monthly/yearly days
      continue;
    }
    if (start >= to || (until && start >= until)) break;
    const end = new Date(start.getTime() + duration);
    const dateKey = start.toISOString().slice(0, 10);
    // All-day events end on their last day (inclusive), so they overlap until the end of that day.
    const effectiveEnd = end.getTime() === start.getTime() ? new Date(end.getTime() + 1) : end;
    if (effectiveEnd > from && !excluded.has(dateKey)) result.push({ start, end, dateKey });
    if (event.recurrence === "NONE") break;
  }
  return result;
}
