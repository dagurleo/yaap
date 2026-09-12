import { createDb } from "../db";
import { HttpError } from "../http";
import type { Env } from "../types";
import type { Site } from "../db/store";
import { sql } from "drizzle-orm";

export type SiteAccess = "owner" | "viewer";
export type SiteCapabilities = {
  viewAnalytics: true;
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
      manageSite: manage,
      managePeople: manage,
      manageCredentials: manage,
    },
  };
}

export async function listAccessibleSites(
  env: Env,
  actorUserId: string,
): Promise<SafeSite[]> {
  const db = createDb(env);
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
      manageSite: row.access === "owner",
      managePeople: row.access === "owner",
      manageCredentials: row.access === "owner",
    },
  }));
}

export async function requireSiteView(
  env: Env,
  actorUserId: string,
  siteId: string,
) {
  validSiteId(siteId);
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
