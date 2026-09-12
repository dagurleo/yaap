import { HttpError } from "../http";
import { validPropertyKey, validPropertyValue } from "./event-properties";
import { reportFilters, type ReportFilters } from "./report-filters";

export type EventFilters = ReportFilters & {
  eventName?: string;
  propertyKey?: string;
  /** Prefixed JSON scalar; the prefix prevents router auto-decoding. */
  propertyValue?: string;
  asOf?: number;
  beforeAt?: number;
  beforeId?: string;
};
export function eventFilters(input: Record<string, unknown>): EventFilters {
  const result: EventFilters = reportFilters(input);
  delete result.compare;
  if (input.eventName !== undefined && input.eventName !== "") {
    if (
      typeof input.eventName !== "string" ||
      !/^[a-zA-Z0-9_.-]{1,64}$/.test(input.eventName)
    )
      throw new HttpError(400, "Invalid event name");
    result.eventName = input.eventName;
  }
  if (input.propertyKey !== undefined && input.propertyKey !== "") {
    if (
      typeof input.propertyKey !== "string" ||
      !validPropertyKey(input.propertyKey)
    )
      throw new HttpError(400, "Invalid property key");
    result.propertyKey = input.propertyKey;
  }
  if (input.propertyValue !== undefined) {
    try {
      if (
        !result.propertyKey ||
        typeof input.propertyValue !== "string" ||
        input.propertyValue.length > 1545 ||
        !input.propertyValue.startsWith("json:")
      )
        throw new Error();
      const value: unknown = JSON.parse(input.propertyValue.slice(5));
      if (!validPropertyValue(value)) throw new Error();
      result.propertyValue = `json:${JSON.stringify(value)}`;
    } catch {
      throw new HttpError(
        400,
        "Choose a property key and a valid scalar value",
      );
    }
  }
  for (const key of ["asOf", "beforeAt"] as const) {
    if (input[key] === undefined) continue;
    const value = Number(input[key]);
    if (!Number.isSafeInteger(value) || value <= 0 || value > Date.now())
      throw new HttpError(400, "Invalid event cursor time");
    result[key] = value;
  }
  if (input.beforeId !== undefined) {
    if (
      typeof input.beforeId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(input.beforeId)
    )
      throw new HttpError(400, "Invalid event cursor ID");
    result.beforeId = input.beforeId;
  }
  if (
    (result.beforeAt !== undefined || result.beforeId !== undefined) &&
    (!result.asOf ||
      !result.beforeAt ||
      !result.beforeId ||
      result.beforeAt > result.asOf)
  )
    throw new HttpError(400, "Incomplete event cursor");
  return result;
}
