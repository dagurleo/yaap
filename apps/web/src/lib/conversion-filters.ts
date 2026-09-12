import { HttpError } from "../http";
import { reportFilters } from "./report-filters";

export function conversionFilters(input: Record<string, unknown>) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HttpError(400, "Invalid conversion report filters");
  const goalId = input.goalId ?? "";
  const dimension = input.dimension ?? "source";
  const sort = input.sort ?? "sessions";
  const direction = input.direction ?? "desc";
  const page = Number(input.page ?? 0);
  if (
    typeof goalId !== "string" ||
    goalId.length > 128 ||
    !["source", "landing"].includes(dimension as string) ||
    !["sessions", "convertedSessions", "conversionRate"].includes(
      sort as string,
    ) ||
    !["asc", "desc"].includes(direction as string) ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 100000
  )
    throw new HttpError(400, "Invalid conversion report filters");
  return {
    ...reportFilters(input),
    goalId,
    dimension: dimension as "source" | "landing",
    sort: sort as "sessions" | "convertedSessions" | "conversionRate",
    direction: direction as "asc" | "desc",
    page,
  };
}
export type ConversionFilters = ReturnType<typeof conversionFilters>;

export function overviewSearch(input: Record<string, unknown>) {
  const { goalId } = conversionFilters(input);
  if (
    input.view !== undefined &&
    !["traffic", "conversions"].includes(input.view as string)
  )
    throw new HttpError(400, "Invalid overview view");
  return {
    ...reportFilters(input),
    ...(goalId ? { goalId } : {}),
    ...(input.view === "conversions" ? { view: "conversions" as const } : {}),
  };
}
