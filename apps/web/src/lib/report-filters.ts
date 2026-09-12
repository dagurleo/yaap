import { calendarDate, dayBoundary, shiftDate } from "./report-timezone";
import { HttpError, isRecord } from "../http";
export const dimensionKeys = [
  "country",
  "path",
  "browser",
  "source",
  "os",
  "device",
  "referrer",
  "campaign",
  "region",
  "city",
] as const;
export type Dimension = (typeof dimensionKeys)[number];
export type ReportFilters = {
  days: number;
  timezone?: string;
  from?: string;
  to?: string;
  compare?: boolean;
} & Partial<Record<Dimension, string>>;
export const unknownValue = "__unknown__";
export const dimensionLabels: Record<Dimension, string> = {
  country: "Country",
  path: "Page",
  browser: "Browser",
  source: "Source",
  os: "OS",
  device: "Device",
  referrer: "Referrer",
  campaign: "Campaign",
  region: "Region",
  city: "City",
};
export const DAY = 86400000;
const validDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export function reportFilters(input: Record<string, unknown>): ReportFilters {
  if (!isRecord(input)) throw new HttpError(400, "Invalid report filters");
  const days = input.days === undefined ? 7 : Number(input.days);
  if (![7, 30, 90].includes(days))
    throw new HttpError(400, "Choose 7, 30, or 90 days");
  const result: ReportFilters = { days };
  if (input.from !== undefined || input.to !== undefined) {
    if (!validDate(input.from) || !validDate(input.to))
      throw new HttpError(400, "Choose valid start and end dates");
    const length = (Date.parse(input.to) - Date.parse(input.from)) / DAY + 1;
    // Future dates are checked after loading the site reporting timezone.
    if (length < 1 || length > 366)
      throw new HttpError(400, "Choose up to 366 days ending today or earlier");
    result.from = input.from;
    result.to = input.to;
  }
  if (
    input.compare !== undefined &&
    ![true, false, "true", "false"].includes(input.compare as boolean)
  )
    throw new HttpError(400, "Invalid comparison");
  if (input.compare === true || input.compare === "true") result.compare = true;
  for (const key of dimensionKeys) {
    const value = input[key];
    if (value === undefined || value === "") continue;
    if (
      typeof value !== "string" ||
      value.length > (key === "path" ? 2048 : 512) ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      throw new HttpError(
        400,
        `Invalid ${dimensionLabels[key].toLowerCase()} filter`,
      );
    if (
      key === "country" &&
      value !== unknownValue &&
      !/^[A-Z]{2}$/.test(value)
    )
      throw new HttpError(400, "Invalid country filter");
    result[key] = value;
  }
  return result;
}
export function reportPeriod(filters: ReportFilters, now = Date.now()) {
  const timezone = filters.timezone ?? "UTC";
  const today = calendarDate(now, timezone);
  const from = filters.from ?? shiftDate(today, 1 - filters.days);
  const to = filters.to ?? today;
  if (to > today)
    throw new HttpError(400, "Choose up to 366 days ending today or earlier");
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const start = dayBoundary(from, timezone);
  const calendarEnd = dayBoundary(shiftDate(to, 1), timezone);
  return {
    start,
    end: Math.min(calendarEnd, now + 1),
    days,
    asOf: now,
    timezone,
    calendarEnd,
    previousStart: dayBoundary(shiftDate(from, -days), timezone),
  };
}
