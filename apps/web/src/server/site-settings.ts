import { validateTimezone } from "../lib/report-timezone";
import { createDb } from "../db";
import { HttpError } from "../http";
import {
  validateTrackingRules,
  validateSiteDetails,
  type TrackingRules,
} from "../lib/site-settings";
import type { Env } from "../types";

export async function saveSiteDetails(
  env: Env,
  ownerId: string,
  siteId: string,
  input: { name: string; origin: string; timezone?: string },
) {
  const details = {
    ...validateSiteDetails(input),
    ...(input.timezone === undefined
      ? {}
      : { timezone: validateTimezone(input.timezone) }),
  };
  const site = await createDb(env).updateSite(siteId, details, ownerId);
  if (!site) throw new HttpError(404, "Website not found");
  return site;
}

export async function saveTrackingRules(
  env: Env,
  ownerId: string,
  siteId: string,
  input: TrackingRules,
  excludeBots: boolean,
) {
  const trackingRules = validateTrackingRules(input);
  if (typeof excludeBots !== "boolean")
    throw new HttpError(400, "Invalid bot setting");
  const site = await createDb(env).updateSite(
    siteId,
    { trackingRules, excludeBots },
    ownerId,
  );
  if (!site) throw new HttpError(404, "Website not found");
  return site;
}
