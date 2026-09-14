import { createDb } from "../db";
import { HttpError } from "../http";
import type { Env } from "../types";
import type { Site } from "../db/store";
import { sql } from "drizzle-orm";
import { calendarDate, dayBoundary, shiftDate } from "../lib/report-timezone";

export type SiteAccess = "owner" | "viewer" | "public";
export type SiteCapabilities = {
  viewAnalytics: true;
  events: boolean;
  visitors: boolean;
  revenue: boolean;
  conversions: boolean;
  manageSite: boolean;
  managePeople: boolean;
  manageCredentials: boolean;
};
export type SafeSite = {
  id: string;
  name: string;
  origin: string;
  timezone: string;
  access: SiteAccess;
  capabilities: SiteCapabilities;
};
export type SiteActivityDay = {
  date: string;
  pageviews: number;
};
export type DashboardSite = SafeSite & {
  recentActivity: SiteActivityDay[];
};

function validSiteId(siteId: string) {
  if (typeof siteId !== "string" || !siteId || siteId.length > 128)
    throw new HttpError(400, "Invalid website");
}

export function safeSite(site: Site, access: SiteAccess): SafeSite {
  const manage = access === "owner";
  return {
    id: site.id,
    name: site.name,
    origin: site.origin,
    timezone: site.timezone,
    access,
    capabilities: {
      viewAnalytics: true,
      events: true,
      visitors: true,
      revenue: true,
      conversions: true,
      manageSite: manage,
      managePeople: manage,
      manageCredentials: manage,
    },
  };
}

async function accessibleSites(
  db: ReturnType<typeof createDb>,
  actorUserId: string,
): Promise<SafeSite[]> {
  const rows = await db.all<{
    id: string;
    name: string;
    origin: string;
    timezone: string;
    access: SiteAccess;
  }>(sql`select s.id,s.name,s.origin,s.timezone,
      case when w.owner_user_id=${actorUserId} then 'owner' else 'viewer' end as access
    from sites s join workspaces w on w.id=s.workspace_id
    left join site_memberships m on m.site_id=s.id and m.user_id=${actorUserId}
    where w.owner_user_id=${actorUserId} or m.user_id is not null
    order by case when w.owner_user_id=${actorUserId} then 0 else 1 end,s.created_at,s.id`);
  return rows.map((row) => ({
    ...row,
    capabilities: {
      viewAnalytics: true,
      events: true,
      visitors: true,
      revenue: true,
      conversions: true,
      manageSite: row.access === "owner",
      managePeople: row.access === "owner",
      manageCredentials: row.access === "owner",
    },
  }));
}

export async function listAccessibleSites(
  env: Env,
  actorUserId: string,
): Promise<SafeSite[]> {
  return accessibleSites(createDb(env), actorUserId);
}

/** Seven local-calendar-day pageview buckets for the website directory. */
export async function listDashboardSites(
  env: Env,
  actorUserId: string,
): Promise<DashboardSite[]> {
  const db = createDb(env);
  const sites = await accessibleSites(db, actorUserId);
  if (!sites.length) return [];

  const now = Date.now();
  const buckets = sites.flatMap((site) => {
    const today = calendarDate(now, site.timezone);
    return Array.from({ length: 7 }, (_, index) => {
      const date = shiftDate(today, index - 6);
      return {
        siteId: site.id,
        date,
        start: dayBoundary(date, site.timezone),
        end: Math.min(dayBoundary(shiftDate(date, 1), site.timezone), now + 1),
      };
    });
  });
  const encodedBuckets = JSON.stringify(buckets);
  const rows = await db.all<SiteActivityDay & { siteId: string }>(
    db.provider === "postgres"
      ? sql`select b."siteId" as "siteId",b.date,count(e.id) as pageviews
          from json_to_recordset(cast(${encodedBuckets} as json))
            as b("siteId" text,date text,start bigint,"end" bigint)
          left join events e on e.site_id=b."siteId" and e.name='pageview'
            and e.received_at>=b.start and e.received_at<b."end"
          group by b."siteId",b.date,b.start order by b."siteId",b.start`
      : sql`select json_extract(b.value,'$.siteId') as "siteId",
            json_extract(b.value,'$.date') as date,count(e.id) as pageviews
          from json_each(${encodedBuckets}) b
          left join events e
            on e.site_id=json_extract(b.value,'$.siteId') and e.name='pageview'
            and e.received_at>=json_extract(b.value,'$.start')
            and e.received_at<json_extract(b.value,'$.end')
          group by "siteId",date,json_extract(b.value,'$.start')
          order by "siteId",json_extract(b.value,'$.start')`,
  );
  const activityBySite = new Map<string, SiteActivityDay[]>();
  for (const { siteId, date, pageviews } of rows) {
    const activity = activityBySite.get(siteId) ?? [];
    activity.push({ date, pageviews });
    activityBySite.set(siteId, activity);
  }
  return sites.map((site) => ({
    ...site,
    recentActivity: activityBySite.get(site.id) ?? [],
  }));
}

export async function requireSiteView(
  env: Env,
  actorUserId: ReportActor,
  siteId: string,
  report: PublicReport = "overview",
) {
  validSiteId(siteId);
  if (typeof actorUserId !== "string") {
    const { resolvePublicSite } = await import("./public-sharing");
    const shared = await resolvePublicSite(env, actorUserId.publicId, report);
    if (shared.site.id !== siteId)
      throw new HttpError(404, "Website not found");
    return shared;
  }
  const db = createDb(env);
  const [grant] = await db.all<{ access: SiteAccess; workspaceId: string }>(
    sql`select case when w.owner_user_id=${actorUserId} then 'owner' else 'viewer' end as access,w.id as "workspaceId"
      from sites s join workspaces w on w.id=s.workspace_id
      left join site_memberships m on m.site_id=s.id and m.user_id=${actorUserId}
      where s.id=${siteId} and (w.owner_user_id=${actorUserId} or m.user_id is not null) limit 1`,
  );
  const site = grant ? await db.findSite(siteId) : undefined;
  if (!site) throw new HttpError(404, "Website not found");
  return {
    db,
    site,
    safeSite: safeSite(site, grant.access),
    access: grant.access,
    workspaceId: grant.workspaceId,
  };
}

export async function requireSiteManage(
  env: Env,
  actorUserId: string,
  siteId: string,
) {
  validSiteId(siteId);
  const db = createDb(env);
  const [context] = await db.all<{ workspaceId: string }>(
    sql`select w.id as "workspaceId" from sites s join workspaces w on w.id=s.workspace_id
      where s.id=${siteId} and w.owner_user_id=${actorUserId} limit 1`,
  );
  const site = context ? await db.findSite(siteId) : undefined;
  if (!site) throw new HttpError(404, "Website not found");
  return {
    db,
    site,
    safeSite: safeSite(site, "owner"),
    access: "owner" as const,
    workspaceId: context.workspaceId,
  };
}

export async function requireAccountOwner(
  env: Env,
  actorUserId: string,
  workspaceId: string,
) {
  const db = createDb(env);
  const [workspace] = await db.all<{
    id: string;
    ownerUserId: string;
    createdAt: number;
    updatedAt: number;
  }>(
    sql`select id,owner_user_id as "ownerUserId",created_at as "createdAt",updated_at as "updatedAt"
      from workspaces where id=${workspaceId} and owner_user_id=${actorUserId} limit 1`,
  );
  if (!workspace) throw new HttpError(404, "Account not found");
  return { db, workspace };
}

/** Compatibility name for management call sites. Never use for report reads. */
export const ownedSite = requireSiteManage;

export type ReportActor = string | { publicId: string };
export type PublicReport =
  | "overview"
  | "events"
  | "visitors"
  | "journey"
  | "revenue"
  | "funnels"
  | "conversions"
  | "live";
