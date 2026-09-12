import { HttpError } from "../http";

export type PropertyValue = string | number | boolean;
export type EventProperties = Record<string, PropertyValue>;
export const propertyKeyPattern = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
export function validPropertyKey(key: string) {
  return (
    propertyKeyPattern.test(key) &&
    !["constructor", "prototype", "__proto__"].includes(key)
  );
}
export function validPropertyValue(value: unknown): value is PropertyValue {
  return (
    (typeof value === "string" &&
      value.length <= 256 &&
      !/[\x00-\x1f\x7f]/.test(value) &&
      !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
        value,
      )) ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}
export function eventProperties(input: unknown): EventProperties {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HttpError(
      400,
      "Properties must be an object of strings, numbers, or booleans",
    );
  const entries = Object.entries(input);
  if (
    entries.length > 20 ||
    entries.some(
      ([key, value]) => !validPropertyKey(key) || !validPropertyValue(value),
    )
  )
    throw new HttpError(
      400,
      "Invalid event properties: use up to 20 scalar properties with valid keys and bounded values",
    );
  const result = Object.fromEntries(entries) as EventProperties;
  if (new TextEncoder().encode(JSON.stringify(result)).length > 2048)
    throw new HttpError(400, "Event properties exceed 2,048 bytes");
  return result;
}
