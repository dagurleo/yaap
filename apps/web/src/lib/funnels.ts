import { HttpError } from "../http";
import { defaultFunnelIcon, validEntityIcon } from "./entity-icons";
import { conversionConditions } from "./conversion-conditions";
import type { EventProperties } from "./event-properties";
export type FunnelStep = {
  kind: "page" | "event";
  value: string;
  conditions?: EventProperties;
};
export type FunnelInput = {
  name: string;
  icon?: string;
  scope: "visitor" | "session";
  windowHours: number;
  steps: FunnelStep[];
};
export function validateFunnel(input: unknown): FunnelInput {
  const body = input as Partial<FunnelInput> | null;
  if (
    !body ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 120 ||
    /[\x00-\x1f\x7f]/.test(body.name)
  )
    throw new HttpError(400, "Enter a funnel name");
  if (body.scope !== "visitor" && body.scope !== "session")
    throw new HttpError(400, "Choose visitors or sessions");
  if (body.icon !== undefined && !validEntityIcon(body.icon))
    throw new HttpError(400, "Choose a valid funnel icon");
  if (![1, 24, 168, 720].includes(body.windowHours!))
    throw new HttpError(400, "Choose a conversion window");
  if (
    !Array.isArray(body.steps) ||
    body.steps.length < 2 ||
    body.steps.length > 8
  )
    throw new HttpError(400, "Add 2–8 funnel steps");
  const steps = body.steps.map((step) => {
    if (!step || typeof step.value !== "string")
      throw new HttpError(400, "Enter each step's page or event");
    if (step.kind === "page") {
      if (
        !step.value.startsWith("/") ||
        step.value.startsWith("//") ||
        step.value.length > 1024 ||
        /[?#\x00-\x1f\x7f]/.test(step.value)
      )
        throw new HttpError(
          400,
          "Use exact page paths without queries or fragments",
        );
    } else if (
      step.kind !== "event" ||
      !/^[a-zA-Z0-9_.-]{1,64}$/.test(step.value) ||
      step.value === "pageview"
    )
      throw new HttpError(400, "Use a valid custom event name");
    const conditions = conversionConditions(step.conditions);
    return {
      kind: step.kind,
      value: step.value,
      ...(Object.keys(conditions).length ? { conditions } : {}),
    };
  });
  return {
    name: body.name.trim(),
    icon: body.icon ?? defaultFunnelIcon,
    scope: body.scope,
    windowHours: body.windowHours!,
    steps,
  };
}
