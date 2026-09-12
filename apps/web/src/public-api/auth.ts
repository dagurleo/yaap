import { sql, type SQL } from "drizzle-orm";
import { createDb } from "../db";
import { requireOwner, appOrigin } from "../server/services";
import type { Env } from "../types";
import {
  ApiError,
  hash,
  scopes,
  invalid,
  type Scope,
  type Input,
} from "./contracts";

export type Principal = {
  id: string;
  ownerId: string;
  kind: "session" | "api" | "oauth";
  scopes: Scope[];
  siteIds: string[];
  allSites: boolean;
};
export type Credential = {
  id: string;
  ownerId: string;
  name: string;
  scopes: string;
  siteIds: string;
  allSites: number;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  kind: "api" | "oauth";
  audience: string | null;
  hint: string;
  clientId: string | null;
  refreshExpiresAt: number | null;
};
export const credentialColumns = sql`id,owner_id as "ownerId",name,scopes,site_ids as "siteIds",all_sites as "allSites",created_at as "createdAt",expires_at as "expiresAt",revoked_at as "revokedAt",kind,audience,hint,client_id as "clientId",refresh_expires_at as "refreshExpiresAt"`;
export function requireScope(p: Principal, scope: Scope) {
  if (!p.scopes.includes(scope))
    throw new ApiError(403, "insufficient_scope", `Requires ${scope}`);
}
export function requireSite(p: Principal, siteId: string) {
  if (!p.allSites && !p.siteIds.includes(siteId))
    throw new ApiError(404, "not_found", "Website not found");
}
export async function authenticate(
  request: Request,
  env: Env,
  allowSession = false,
): Promise<Principal> {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    if (!/^Bearer yaap_(?:key|access)_[A-Za-z0-9_-]{43}$/.test(authorization))
      throw new ApiError(401, "invalid_token", "Invalid access token");
    const [row] = await createDb(env).all<Credential>(
      sql`select ${credentialColumns} from api_credentials where token_hash=${hash(authorization.slice(7))} and revoked_at is null and expires_at>${Date.now()} and (kind != 'oauth' or exists(select 1 from oauth_clients where oauth_clients.id=api_credentials.client_id and oauth_clients.owner_id=api_credentials.owner_id))`,
    );
    if (
      !row ||
      (row.kind === "oauth" &&
        row.audience !== appOrigin(request, env) + "/mcp")
    )
      throw new ApiError(
        401,
        "invalid_token",
        "Invalid or expired access token",
      );
    // OAuth grants are bound to the MCP resource, not the REST API.
    if (row.kind === "oauth" && new URL(request.url).pathname !== "/mcp")
      throw new ApiError(
        401,
        "invalid_token",
        "Token audience does not match this resource",
      );
    return {
      id: row.id,
      ownerId: row.ownerId,
      kind: row.kind,
      scopes: JSON.parse(row.scopes),
      siteIds: JSON.parse(row.siteIds),
      allSites: !!row.allSites,
    };
  }
  if (!allowSession)
    throw new ApiError(401, "unauthorized", "A bearer token is required");
  const ownerId = await requireOwner(request, env);
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("origin") !== appOrigin(request, env)
  )
    throw new ApiError(403, "invalid_origin", "Origin not allowed");
  return {
    id: `owner:${ownerId}`,
    ownerId,
    kind: "session",
    scopes: [...scopes],
    siteIds: [],
    allSites: true,
  };
}
export async function grants(env: Env, ownerId: string, input: Input) {
  const selected = input.scopes;
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    selected.length > scopes.length ||
    selected.some((v) => !scopes.includes(v))
  )
    invalid("Choose valid scopes");
  if (typeof input.allSites !== "boolean")
    invalid("Specify allSites explicitly");
  if (
    !Array.isArray(input.siteIds) ||
    input.siteIds.length > 100 ||
    input.siteIds.some(
      (id) => typeof id !== "string" || !id || id.length > 128,
    ) ||
    (input.allSites && input.siteIds.length)
  )
    invalid("Specify up to 100 siteIds, or allSites with an empty list");
  const siteIds = [...new Set(input.siteIds as string[])];
  if (!input.allSites && !siteIds.length && !selected.includes("sites:create"))
    invalid("Choose at least one website");
  const db = createDb(env);
  if (siteIds.length) {
    const rows = await db.all<{ id: string }>(
      sql`select id from sites where owner_id=${ownerId} and ${siteGrantSql(db.provider, sql`id`, siteIds)}`,
    );
    if (rows.length !== siteIds.length) invalid("Website grant not found");
  }
  return {
    scopes: [...new Set(selected)] as Scope[],
    siteIds,
    allSites: input.allSites,
  };
}
export async function rateLimit(
  env: Env,
  p: Principal,
  expensive: boolean,
  siteId?: string,
) {
  const db = createDb(env),
    now = Date.now(),
    minute = Math.floor(now / 60000);
  const max = expensive ? 30 : 120;
  for (const key of [
    `public:${p.id}:${expensive}:${minute}`,
    ...(siteId ? [`public:site:${siteId}:${expensive}:${minute}`] : []),
  ]) {
    if ((await db.incrementRateLimit(key, (minute + 1) * 60000)) > max)
      throw new ApiError(
        429,
        "rate_limited",
        "Request limit reached; retry after one minute",
      );
  }
}

/** Bind a grant list once, including at D1's 100-parameter boundary. */
export function siteGrantSql(
  provider: "d1" | "postgres",
  column: SQL,
  ids: string[],
) {
  const list = JSON.stringify(ids);
  return provider === "postgres"
    ? sql`${column} in (select jsonb_array_elements_text(${list}::jsonb))`
    : sql`${column} in (select value from json_each(${list}))`;
}
