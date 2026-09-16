import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb } from "../db";
import { HttpError, json, readJson, requiredString } from "../http";
import {
  allowedTrackingOrigin,
  excludedByTrackingRules,
} from "../lib/site-settings";
import { botFilters, type BotFilters } from "../lib/bot-traffic";
import { calendarDate } from "../lib/report-timezone";
import { reportPeriod } from "../lib/report-filters";
import {
  classifyBot,
  isBotTrackingPath,
  type BotClassification,
} from "../../../../packages/client/src/bots";
import { requireSiteManage, requireSiteView } from "./access";
import { canHostedWorkspaceCollect } from "./billing/usage";
import { billingConfig } from "./billing/config";
import type { Env } from "../types";

export { classifyBot };
export function detectRequestBot(request: Request) {
  const cf = request.cf as
    { botManagement?: { verifiedBot?: boolean } } | undefined;
  const verified = cf?.botManagement?.verifiedBot === true;
  const bot = classifyBot(request.headers.get("user-agent") ?? "");
  if (!bot && !verified) return null;
  return {
    bot:
      bot ??
      ({
        name: "Other automation",
        provider: "Unknown",
        category: "other",
      } as BotClassification),
    detection: verified ? ("cloudflare" as const) : ("user_agent" as const),
  };
}
const digest = (token: string) => createHash("sha256").update(token).digest();
export async function changeBotToken(
  env: Env,
  actorId: string,
  siteId: string,
  action: "rotate" | "revoke",
) {
  const { db } = await requireSiteManage(env, actorId, siteId);
  if (action === "revoke") {
    await db.run(sql`delete from bot_tracking_tokens where site_id=${siteId}`);
    return { token: null };
  }
  if (action !== "rotate") throw new HttpError(400, "Invalid token action");
  const token = `yaap_bot_${Buffer.from(randomBytes(32)).toString("hex")}`;
  await db.run(sql`insert into bot_tracking_tokens (site_id,token_hash) values (${siteId},${Buffer.from(digest(token)).toString("hex")})
    on conflict (site_id) do update set token_hash=excluded.token_hash`);
  return { token };
}
export async function recordBotRequest(
  env: Env,
  event: {
    siteId: string;
    id: string;
    path: string;
    bot: BotClassification;
    source: "browser" | "server";
    detection: "user_agent" | "cloudflare";
    statusCode?: number | null;
  },
) {
  await createDb(env).run(sql`insert into bot_requests
    (site_id,id,received_at,path,name,provider,category,source,detection,status_code)
    values (${event.siteId},${event.id},${Date.now()},${event.path},${event.bot.name},${event.bot.provider},${event.bot.category},${event.source},${event.detection},${event.statusCode ?? null})
    on conflict (site_id,id) do nothing`);
}
export async function ingestBotRequest(request: Request, env: Env) {
  const body = await readJson(request, 8192);
  const siteId = requiredString(body, "siteId", 64);
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (yaap_bot_[a-f0-9]{64})$/)?.[1];
  const db = createDb(env);
  const [credentials] = await db.all<{ hash: string }>(
    sql`select token_hash as hash from bot_tracking_tokens where site_id=${siteId}`,
  );
  if (
    !token ||
    !credentials ||
    !timingSafeEqual(digest(token), Buffer.from(credentials.hash, "hex"))
  )
    throw new HttpError(401, "Invalid bot tracking token");
  const site = await db.findSite(siteId);
  if (!site) throw new HttpError(404, "Website not found");
  const id = requiredString(body, "id", 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(id))
    throw new HttpError(400, "Invalid request ID");
  let url: URL;
  try {
    url = new URL(requiredString(body, "url", 2048));
  } catch {
    throw new HttpError(400, "Invalid page URL");
  }
  if (
    url.username ||
    url.password ||
    url.pathname.length > 1024 ||
    !allowedTrackingOrigin(url.origin, site.origin, site.trackingRules)
  )
    throw new HttpError(403, "Page origin is not allowed");
  const userAgent = requiredString(body, "userAgent", 2048);
  const statusCode = body.statusCode;
  if (
    statusCode != null &&
    (!Number.isInteger(statusCode) ||
      Number(statusCode) < 100 ||
      Number(statusCode) > 599)
  )
    throw new HttpError(400, "Invalid status code");
  const bot = classifyBot(userAgent);
  if (
    !bot ||
    !isBotTrackingPath(url.pathname) ||
    excludedByTrackingRules(url.origin, url.pathname, site.trackingRules)
  )
    return json({ ignored: true }, 202);
  if (
    billingConfig(env).mode === "hosted" &&
    !(await canHostedWorkspaceCollect(env, site.workspaceId, Date.now()))
  )
    return json({ accepted: false, reason: "collection_paused" }, 409);
  // Authenticate the sender, but never treat its UA or CF claims as IP verification.
  await recordBotRequest(env, {
    siteId,
    id: `s:${id}`,
    path: url.pathname,
    bot,
    source: "server",
    detection: "user_agent",
    statusCode: statusCode as number | undefined,
  });
  return json({ accepted: true }, 202);
}
export async function siteBotTraffic(
  env: Env,
  actorId: string,
  siteId: string,
  input: BotFilters,
) {
  const { db, site, safeSite, access } = await requireSiteView(
    env,
    actorId,
    siteId,
  );
  const filters = botFilters(input);
  const period = reportPeriod({ days: filters.days, timezone: site.timezone });
  const where = sql`site_id=${siteId} and received_at>=${period.start} and received_at<${period.end}
    ${filters.category === "all" ? sql`` : sql`and category=${filters.category}`}
    ${filters.botSource === "all" ? sql`` : sql`and source=${filters.botSource}`}`;
  const [totals, crawlers, pages, recent, tokens] = await Promise.all([
    db.all<{ requests: number; crawlers: number; errors: number }>(
      sql`select count(*) as requests,count(distinct name) as crawlers,coalesce(sum(case when status_code>=400 then 1 else 0 end),0) as errors from bot_requests where ${where}`,
    ),
    db.all<{
      name: string;
      provider: string;
      category: keyof typeof import("../lib/bot-traffic").botCategories;
      requests: number;
    }>(
      sql`select name,provider,category,count(*) as requests from bot_requests where ${where} group by name,provider,category order by requests desc,name limit 50`,
    ),
    db.all<{ path: string; requests: number }>(
      sql`select path,count(*) as requests from bot_requests where ${where} group by path order by requests desc,path limit 20`,
    ),
    db.all<{
      id: string;
      path: string;
      name: string;
      source: string;
      detection: string;
      statusCode: number | null;
      receivedAt: number;
    }>(
      sql`select id,path,name,source,detection,status_code as "statusCode",received_at as "receivedAt" from bot_requests where ${where} order by received_at desc,id desc limit 50`,
    ),
    db.all(
      sql`select site_id from bot_tracking_tokens where site_id=${siteId}`,
    ),
  ]);
  return {
    site: safeSite,
    canManage: access === "owner",
    excludeBots: site.excludeBots,
    tokenConfigured: tokens.length > 0,
    ...period,
    from: calendarDate(period.start, site.timezone),
    to: calendarDate(period.end - 1, site.timezone),
    totals: totals[0],
    crawlers,
    pages,
    recent,
  };
}
