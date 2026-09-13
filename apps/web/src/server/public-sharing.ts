import { sql } from "drizzle-orm";
import { createDb } from "../db";
import { HttpError } from "../http";
import type { Env } from "../types";
import { safeSite, requireSiteManage, type PublicReport } from "./access";
import {
  privateSharing,
  sharingSchema,
  publicIdSchema,
  publicReadSchema,
} from "../lib/public-sharing";
import { siteOverview } from "./overview";
import { siteEventExplorer } from "./event-explorer";
import {
  siteVisitors,
  visitorJourney,
  type VisitorFilters,
  type JourneyCursor,
} from "./visitors";
import { siteRevenue } from "./revenue";
import { siteFunnels } from "./funnels";
import { siteConversions } from "./conversion-report";
import { liveActivity } from "./session-metrics";
import { reportFilters } from "../lib/report-filters";
import { eventFilters } from "../lib/event-filters";
import { revenueFilters } from "../lib/revenue-filters";
import { conversionFilters } from "../lib/conversion-filters";

type ShareRow = {
  siteId: string;
  publicId: string;
  enabled: number;
  events: number;
  visitors: number;
  revenue: number;
  conversions: number;
};
const fields = sql`site_id as "siteId",public_id as "publicId",enabled,events,visitors,revenue,conversions`;
const settings = (row: ShareRow) => ({
  enabled: !!row.enabled,
  events: !!row.events,
  visitors: !!row.visitors,
  revenue: !!row.revenue,
  conversions: !!row.conversions,
});
export async function sharingSettings(
  env: Env,
  userId: string,
  siteId: string,
) {
  const { db } = await requireSiteManage(env, userId, siteId);
  const [row] = await db.all<ShareRow>(
    sql`select ${fields} from site_public_shares where site_id=${siteId}`,
  );
  return {
    ...(row ? settings(row) : privateSharing),
    publicId: row?.publicId ?? null,
  };
}
export async function saveSharing(
  env: Env,
  userId: string,
  siteId: string,
  input: unknown,
) {
  const value = sharingSchema.parse(input);
  const { db } = await requireSiteManage(env, userId, siteId);
  await db.run(sql`insert into site_public_shares (site_id,public_id,enabled,events,visitors,revenue,conversions)
    values (${siteId},${crypto.randomUUID()},${Number(value.enabled)},${Number(value.events)},${Number(value.visitors)},${Number(value.revenue)},${Number(value.conversions)})
    on conflict(site_id) do update set enabled=excluded.enabled,events=excluded.events,visitors=excluded.visitors,revenue=excluded.revenue,conversions=excluded.conversions`);
  return sharingSettings(env, userId, siteId);
}
export async function resolvePublicSite(
  env: Env,
  publicId: string,
  report: PublicReport = "overview",
) {
  if (!publicIdSchema.safeParse(publicId).success)
    throw new HttpError(404, "Public dashboard unavailable");
  const db = createDb(env);
  const [row] = await db.all<ShareRow>(
    sql`select ${fields} from site_public_shares where public_id=${publicId} and enabled=1`,
  );
  const site = row ? await db.findSite(row.siteId) : undefined;
  if (!row || !site) throw new HttpError(404, "Public dashboard unavailable");
  const permissions = settings(row);
  const category =
    report === "journey" || report === "live"
      ? "visitors"
      : report === "funnels"
        ? "conversions"
        : report;
  if (category !== "overview" && !permissions[category])
    throw new HttpError(404, "This report is not shared");
  const sharedSite = safeSite(site, "public");
  sharedSite.capabilities = {
    ...sharedSite.capabilities,
    events: permissions.events,
    visitors: permissions.visitors,
    revenue: permissions.revenue,
    conversions: permissions.conversions,
  };
  return {
    db,
    site,
    safeSite: sharedSite,
    access: "public" as const,
    workspaceId: site.workspaceId,
    permissions,
  };
}
export async function publicSiteInfo(env: Env, publicId: string) {
  const { safeSite: site } = await resolvePublicSite(env, publicId);
  return {
    site,
    publicId,
    isDemo: !!env.YAAP_DEMO_SITE_ID && site.id === env.YAAP_DEMO_SITE_ID,
  };
}
export async function demoPublicId(env: Env) {
  if (!env.YAAP_DEMO_SITE_ID)
    throw new HttpError(404, "Demo is not configured");
  const [row] = await createDb(env).all<{ publicId: string }>(
    sql`select public_id as "publicId" from site_public_shares where site_id=${env.YAAP_DEMO_SITE_ID} and enabled=1`,
  );
  if (!row) throw new HttpError(404, "Demo is not available");
  return row.publicId;
}
/** One public read boundary; every call rechecks sharing and the requested category. */
export async function readPublicReport(env: Env, input: unknown) {
  const { publicId, report, filters } = publicReadSchema.parse(input);
  const { db, site, permissions } = await resolvePublicSite(
    env,
    publicId,
    report,
  );
  const actor = { publicId };
  switch (report) {
    case "overview": {
      const data = await siteOverview(
        env,
        actor,
        site.id,
        reportFilters(filters),
        false,
      );
      if (!permissions.events) {
        data.customEvents = [];
        data.customTotals = { count: 0, names: 0 };
      }
      if (!permissions.conversions) {
        data.goals = [];
        if (data.comparison) data.comparison.goals = [];
      }
      return data;
    }
    case "events": {
      const data = await siteEventExplorer(
        env,
        actor,
        site.id,
        eventFilters(filters),
      );
      if (!permissions.visitors)
        data.events = data.events.map((row) => ({ ...row, visitorId: null }));
      return data;
    }
    case "visitors": {
      if (!permissions.conversions && filters.goalId)
        throw new HttpError(404, "This report is not shared");
      const data = await siteVisitors(env, actor, site.id, {
        ...reportFilters(filters),
        cohort: filters.cohort ?? "all",
        goalId: filters.goalId ?? "",
        page: filters.page ?? 0,
      } as VisitorFilters);
      if (!permissions.conversions) data.goals = [];
      return data;
    }
    case "journey": {
      const data = await visitorJourney(
        env,
        actor,
        site.id,
        filters.visitorId as string,
        filters.asOf as number,
        filters.cursor as JourneyCursor | undefined,
      );
      if (!permissions.revenue) data.payments = [];
      if (!permissions.events)
        data.events = data.events
          .filter((row) => row.name === "pageview")
          .map((row) => ({ ...row, properties: "{}" }));
      if (!permissions.conversions)
        data.events = data.events.map((row) => ({
          ...row,
          goals: [],
          goalName: null,
          goalArchived: null,
        }));
      return data;
    }
    case "revenue": {
      if (!permissions.visitors && filters.visitorId)
        throw new HttpError(404, "This report is not shared");
      const data = await siteRevenue(
        env,
        actor,
        site.id,
        revenueFilters(filters),
      );
      if (!permissions.visitors)
        data.payments = data.payments.map((row) => ({
          ...row,
          visitorId: null,
        }));
      return data;
    }
    case "funnels":
      return siteFunnels(
        env,
        actor,
        site.id,
        reportFilters(filters),
        typeof filters.funnelId === "string" ? filters.funnelId : undefined,
      );
    case "conversions":
      return siteConversions(env, actor, site.id, conversionFilters(filters));
    case "live": {
      const data = await liveActivity(db, site.id, reportFilters(filters));
      if (!permissions.events)
        data.rows = data.rows.filter((row) => row.name === "pageview");
      return data;
    }
  }
}
