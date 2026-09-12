import { sql } from "drizzle-orm";
import { createDb } from "../db";
import { segmentFilter, trafficSource } from "./report-filter";
import type { ReportFilters } from "../lib/report-filters";

export async function sessionMetrics(
  db: ReturnType<typeof createDb>,
  siteId: string,
  filters: ReportFilters,
  start: number,
  end: number,
) {
  const segment = segmentFilter(filters);
  // Select sessions from matching events, then measure the complete recorded session before the report's end.
  const cte = sql`with eligible as (
    select distinct visitor_id, session_id from events where site_id = ${siteId}
      and visitor_id is not null and session_id is not null and received_at >= ${start} and received_at < ${end} and ${segment}
  ), session_events as materialized (
    select e.visitor_id, e.session_id, e.received_at, e.id, e.name, e.path from events e join eligible s on s.visitor_id = e.visitor_id and s.session_id = e.session_id
      where e.site_id = ${siteId} and e.received_at < ${end}
  ), sessions as (
    select visitor_id, session_id, min(received_at) as started, max(received_at) as ended,
      sum(case when name = 'pageview' then 1 else 0 end) as views,
      sum(case when name != 'pageview' then 1 else 0 end) as "customEvents"
    from session_events group by visitor_id, session_id
  ), pages as materialized (
    select path, row_number() over (partition by visitor_id, session_id order by received_at, id) as "entryRank",
      row_number() over (partition by visitor_id, session_id order by received_at desc, id desc) as "exitRank"
    from session_events where name = 'pageview'
  )`;
  // Materialize once for all three panels instead of repeating session expansion
  // and both page-ordering windows in separate queries.
  const [result] = await db.all<{
    sessions: number;
    pageviewSessions: number;
    bouncedSessions: number;
    averageDurationMs: number | null;
    entryPages: string;
    exitPages: string;
  }>(sql`${cte}
    select count(*) as sessions, count(case when views > 0 then 1 end) as "pageviewSessions",
      count(case when views = 1 and "customEvents" = 0 then 1 end) as "bouncedSessions",
      avg(ended - started) as "averageDurationMs",
      (select ${db.expr.jsonGroupArray(sql`${db.expr.jsonObject(sql`'path', path, 'sessions', total`)}`)} from (
        select path, count(*) as total from pages where "entryRank" = 1
        group by path order by total desc, path asc limit 10
      )) as "entryPages",
      (select ${db.expr.jsonGroupArray(sql`${db.expr.jsonObject(sql`'path', path, 'sessions', total`)}`)} from (
        select path, count(*) as total from pages where "exitRank" = 1
        group by path order by total desc, path asc limit 10
      )) as "exitPages"
    from sessions`);
  return {
    ...result,
    bounceRate: result.pageviewSessions
      ? result.bouncedSessions / result.pageviewSessions
      : null,
    entryPages: JSON.parse(result.entryPages) as {
      path: string;
      sessions: number;
    }[],
    exitPages: JSON.parse(result.exitPages) as {
      path: string;
      sessions: number;
    }[],
  };
}
export type LiveVisitor = {
  visitorId: string;
  sessionId: string | null;
  path: string;
  name: string;
  receivedAt: number;
  country: string | null;
  browser: string | null;
  device: string | null;
  source: string;
};
export async function liveActivity(
  db: ReturnType<typeof createDb>,
  siteId: string,
  filters: ReportFilters,
  asOf = Date.now(),
) {
  const since = asOf - 300000;
  const segment = segmentFilter(filters);
  const cte = sql`with recent as (select visitor_id as "visitorId", session_id as "sessionId", path, name, received_at as "receivedAt", country, browser, device, ${trafficSource} as source,
    row_number() over (partition by visitor_id order by received_at desc, id desc) as rank
    from events where site_id = ${siteId} and visitor_id is not null and received_at >= ${since} and received_at <= ${asOf} and ${segment})`;
  const [rows, totals] = await Promise.all([
    db.all<LiveVisitor>(
      sql`${cte} select "visitorId", "sessionId", path, name, "receivedAt", country, browser, device, source from recent where rank = 1 order by "receivedAt" desc, "visitorId" asc limit 20`,
    ),
    db.all<{ visitors: number }>(
      sql`${cte} select count(*) as visitors from recent where rank = 1`,
    ),
  ]);
  const onlineSince = asOf - 60_000;
  const onlineRows = await db.all<{
    visitorId: string;
    sessionId: string;
    path: string;
    receivedAt: number;
    country: string | null;
    source: string;
    total: number;
  }>(sql`
    select visitor_id as "visitorId", session_id as "sessionId", path, received_at as "receivedAt", country, source, count(*) over () as total
    from visitor_presence where site_id = ${siteId} and received_at > ${onlineSince} and received_at <= ${asOf}
    order by received_at desc, visitor_id asc limit 20`);
  return {
    asOf,
    since,
    visitors: totals[0].visitors,
    rows,
    online: {
      visitors: onlineRows[0]?.total ?? 0,
      rows: onlineRows,
      since: onlineSince,
    },
  };
}
