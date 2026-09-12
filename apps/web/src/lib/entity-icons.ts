export const entityIconNames = [
  "target",
  "flag",
  "route",
  "user-plus",
  "shopping-cart",
  "credit-card",
  "mouse-pointer",
  "mail",
  "download",
  "calendar-check",
  "sparkles",
  "zap",
] as const;

export type EntityIconName = (typeof entityIconNames)[number];

export const defaultGoalIcon: EntityIconName = "target";
export const defaultFunnelIcon: EntityIconName = "route";

export function validEntityIcon(value: unknown): value is EntityIconName {
  return entityIconNames.includes(value as EntityIconName);
}
