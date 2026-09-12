import { HttpError } from "../http";

const DAY = 86400000;
const formatters = new Map<string, Intl.DateTimeFormat>();
export function validateTimezone(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(value)
  )
    throw new HttpError(400, "Choose a valid reporting timezone");
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
      .timeZone;
  } catch {
    throw new HttpError(400, "Choose a valid reporting timezone");
  }
}
export function calendarDate(at: number, timezone = "UTC"): string {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(at);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
}
const boundaries = new Map<string, number>();
/** First instant of a local calendar date, including midnight offset changes.
 * A skipped date has the same boundary as the next existing date. */
export function dayBoundary(date: string, timezone = "UTC"): number {
  if (timezone === "UTC") return Date.parse(date);
  const key = `${timezone}:${date}`;
  const cached = boundaries.get(key);
  if (cached !== undefined) return cached;
  const midnight = Date.parse(date);
  let low = midnight - 2 * DAY,
    high = midnight + 2 * DAY;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (calendarDate(mid, timezone) < date) low = mid + 1;
    else high = mid;
  }
  if (boundaries.size >= 4096) boundaries.clear();
  boundaries.set(key, low);
  return low;
}
export function calendarBuckets(start: number, end: number, timezone = "UTC") {
  const result: { date: string; start: number; end: number }[] = [];
  for (
    let date = calendarDate(start, timezone);
    dayBoundary(date, timezone) < end;
    date = shiftDate(date, 1)
  ) {
    result.push({
      date,
      start: Math.max(start, dayBoundary(date, timezone)),
      end: Math.min(end, dayBoundary(shiftDate(date, 1), timezone)),
    });
  }
  return result;
}
export function formatTimestamp(at: number, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}
