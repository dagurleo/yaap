import type { ReportActor } from "./access";
import { requireSiteView } from "./access";
import { goalMatch } from "./conversion-match";
import { matchesConditions } from "../lib/conversion-conditions";
import type { EventProperties } from "../lib/event-properties";
import {
  reportFilters,
  reportPeriod,
  type ReportFilters,
} from "../lib/report-filters";
import { segmentFilter } from "./report-filter";
import { sql } from "drizzle-orm";
import { HttpError } from "../http";
import type { RevenuePayment } from "./revenue";
import type { Env } from "../types";

export type VisitorFilters = ReportFilters & {
  cohort: "all" | "new" | "returning";
  goalId: string;
  page: number;
};
export type JourneyCursor = { at: number; id: string };
export function validateVisitorFilters(data: VisitorFilters) {
  if (
    !data ||
    ![7, 30, 90].includes(data.days) ||
    !["all", "new", "returning"].includes(data.cohort) ||
    typeof data.goalId !== "string" ||
    data.goalId.length > 128 ||
    !Number.isSafeInteger(data.page) ||
    data.page < 0 ||
    data.page > 100000
  )
    throw new HttpError(400, "Invalid visitor filters");
  return { ...data, ...reportFilters(data) };
}

export type VisitorRow = {
  visitorId: string;
  firstSeen: number;
  lastSeen: number;
  sessions: number;
  pageviews: number;
  country: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
};
export async function siteVisitors(
  env: Env,
  actorUserId: ReportActor,
  siteId: string,
  filters: VisitorFilters,
) {
  filters = validateVisitorFilters(filters);
  const { db, site, safeSite } = await requireSiteView(
    env,
    actorUserId,
    siteId,
    "visitors",
  );
  filters.timezone = site.timezone;
  const { start, end, asOf } = reportPeriod(filters);
  const segment = segmentFilter(filters);
  const goalRows = await db.listGoals(siteId);
  const goal = filters.goalId
    ? goalRows.find((row) => row.id === filters.goalId)
    : null;
  if (filters.goalId && !goal) throw new HttpError(400, "Goal not found");
  const cte = sql`with active as (
    select visitor_id as "visitorId", max(received_at) as "lastSeen",
      count(distinct session_id) as sessions,
      sum(case when name = 'pageview' then 1 else 0 end) as pageviews
    from events where site_id = ${siteId} and visitor_id is not null
      and received_at >= ${start} and received_at < ${end} and ${segment}
    group by visitor_id
  ), history as (
    select active.*, (select min(h.received_at) from events h
      where h.site_id = ${siteId} and h.visitor_id = active."visitorId") as "firstSeen" from active
  ), filtered as (select * from history where
    ${filters.cohort === "new" ? sql`"firstSeen" >= ${start}` : filters.cohort === "returning" ? sql`"firstSeen" < ${start}` : sql`1=1`}
    and ${goal ? sql`exists (select 1 from events where site_id = ${siteId} and visitor_id = history."visitorId" and ${goalMatch(db, goal)} and received_at >= ${start} and received_at < ${end} and ${segment})` : sql`1=1`})`;
  const [counts, visitors] = await Promise.all([
    db.all<{ total: number }>(
      sql`${cte} select count(*) as total from filtered`,
    ),
    db.all<VisitorRow>(sql`${cte}, paged as materialized (
      select * from filtered order by "lastSeen" desc, "visitorId" asc limit 50 offset ${filters.page * 50}
    ) select f.*, e.country, e.browser, e.os, e.device from paged f
      cross join events e
      where e.site_id = ${siteId} and e.id = (select id from events where site_id = ${siteId} and visitor_id = f."visitorId" and received_at >= ${start} and received_at < ${end} and ${segment} order by received_at desc, id desc limit 1)
      order by f."lastSeen" desc, f."visitorId" asc`),
  ]);
  return {
    site: safeSite,
    start,
    asOf,
    end,
    visitors,
    total: counts[0].total,
    goals: goalRows.map(({ id, name, archived }) => ({ id, name, archived })),
  };
}
export type JourneyEvent = {
  id: string;
  name: string;
  path: string;
  receivedAt: number;
  sessionId: string | null;
  sessionStart: number;
  entryPath: string;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  properties: string;
  goals: { id: string; name: string; archived: boolean }[];
  goalName: string | null;
  goalArchived: number | null;
};
export async function visitorJourney(
  env: Env,
  actorUserId: ReportActor,
  siteId: string,
  visitorId: string,
  asOf: number,
  cursor?: JourneyCursor,
) {
  if (
    typeof visitorId !== "string" ||
    !visitorId ||
    visitorId.length > 128 ||
    !Number.isSafeInteger(asOf) ||
    asOf < 0 ||
    asOf > Date.now() + 60000 ||
    (cursor &&
      (!Number.isSafeInteger(cursor.at) ||
        cursor.at < 0 ||
        cursor.at > asOf ||
        typeof cursor.id !== "string" ||
        !cursor.id ||
        cursor.id.length > 128))
  )
    throw new HttpError(400, "Invalid journey filters");
  const { db } = await requireSiteView(env, actorUserId, siteId, "journey");
  const end = Math.min(asOf, Date.now());
  const [summary] = await db.all<{
    firstSeen: number | null;
    lastSeen: number | null;
    sessions: number;
    eventCount: number;
  }>(sql`
    select min(received_at) as "firstSeen", max(received_at) as "lastSeen", count(distinct session_id) as sessions, count(*) as "eventCount"
    from events where site_id = ${siteId} and visitor_id = ${visitorId} and received_at <= ${end}`);
  if (summary.firstSeen === null) throw new HttpError(404, "Visitor not found");
  // Window values are calculated before pagination so split sessions retain their original entry context.
  const rows = await db.all<JourneyEvent>(sql`with journey as (
    select id, name, path, properties, received_at as "receivedAt", session_id as "sessionId",
      first_value(received_at) over session as "sessionStart", first_value(path) over session as "entryPath",
      first_value(referrer_host) over session as "referrerHost", first_value(utm_source) over session as "utmSource",
      first_value(utm_medium) over session as "utmMedium", first_value(utm_campaign) over session as "utmCampaign"
    from events where site_id = ${siteId} and visitor_id = ${visitorId} and received_at <= ${end}
    window session as (partition by session_id, case when session_id is null then id end order by received_at, id)
  ) select j.* from journey j
    where ${cursor ? sql`(j."receivedAt" < ${cursor.at} or (j."receivedAt" = ${cursor.at} and j.id < ${cursor.id}))` : sql`1=1`}
    order by j."receivedAt" desc, j.id desc limit 101`);
  const linkedPayments = await db.all<
    Pick<
      RevenuePayment,
      | "externalId"
      | "provider"
      | "mode"
      | "currency"
      | "amount"
      | "refundedAmount"
      | "paidAt"
    >
  >(
    sql`select external_id as "externalId",provider,mode,currency,amount,refunded_amount as "refundedAmount",paid_at as "paidAt" from payments where site_id=${siteId} and visitor_id=${visitorId} and paid_at<=${end} order by paid_at desc,provider,external_id limit 20`,
  );
  const definitions = await db.listGoals(siteId);
  const events = rows.slice(0, 100).map((row): JourneyEvent => {
    const properties = JSON.parse(row.properties) as EventProperties;
    const goals = definitions
      .filter(
        (goal) =>
          goal.eventName === row.name &&
          (goal.path === null || goal.path === row.path) &&
          matchesConditions(properties, goal.conditions),
      )
      .map(({ id, name, archived }) => ({ id, name, archived }));
    return {
      ...row,
      goals,
      goalName: goals[0]?.name ?? null,
      goalArchived: goals[0] ? Number(goals[0].archived) : null,
    };
  });
  const last = events.at(-1);
  return {
    visitorId,
    ...summary,
    payments: linkedPayments,
    events,
    nextCursor:
      rows.length > 100 && last ? { at: last.receivedAt, id: last.id } : null,
  };
}
