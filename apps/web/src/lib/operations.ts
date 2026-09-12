import { HttpError } from "../http";
export const retentionOptions = [0, 30, 90, 180, 365] as const;
export type OperationsSettings = {
  eventRetentionDays: number;
  paymentRetentionDays: number;
  excludeBots: boolean;
};
export function validateOperationsSettings(input: unknown): OperationsSettings {
  if (!input || typeof input !== "object")
    throw new HttpError(400, "Invalid settings");
  const p = input as OperationsSettings;
  if (
    !retentionOptions.some((days) => days === p.eventRetentionDays) ||
    !retentionOptions.some((days) => days === p.paymentRetentionDays) ||
    typeof p.excludeBots !== "boolean"
  )
    throw new HttpError(400, "Invalid retention or bot setting");
  return {
    eventRetentionDays: p.eventRetentionDays,
    paymentRetentionDays: p.paymentRetentionDays,
    excludeBots: p.excludeBots,
  };
}
