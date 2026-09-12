import { reportFilters, type ReportFilters } from "./report-filters";
import { HttpError } from "../http";
export type RevenueFilters = ReportFilters & {
  mode: "test" | "live";
  page: number;
  visitorId?: string;
};
export function revenueFilters(input: Record<string, unknown>): RevenueFilters {
  const filters = reportFilters(input);
  const mode = input.mode ?? "live",
    page = Number(input.page ?? 0);
  if (
    (mode !== "live" && mode !== "test") ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 100000
  )
    throw new HttpError(400, "Invalid revenue filters");
  if (
    input.visitorId !== undefined &&
    (typeof input.visitorId !== "string" ||
      !/^[a-f0-9]{64}$/.test(input.visitorId))
  )
    throw new HttpError(400, "Invalid visitor filter");
  return {
    ...filters,
    mode,
    page,
    ...(input.visitorId ? { visitorId: input.visitorId as string } : {}),
  };
}
