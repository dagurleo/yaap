import { HttpError } from "../http";
import { eventProperties, type EventProperties } from "./event-properties";

export function conversionConditions(input: unknown): EventProperties {
  const properties = eventProperties(input);
  const entries = Object.entries(properties).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (entries.length > 3)
    throw new HttpError(400, "Use up to three property conditions");
  return Object.fromEntries(entries);
}

export function conditionsLabel(conditions?: EventProperties) {
  return Object.entries(conditions ?? {})
    .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
    .join(" · ");
}

export function matchesConditions(
  properties: EventProperties,
  conditions: EventProperties,
) {
  return Object.entries(conditions).every(
    ([key, value]) =>
      Object.hasOwn(properties, key) && properties[key] === value,
  );
}
