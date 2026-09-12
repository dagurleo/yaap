import { sql } from "drizzle-orm";
import { HttpError } from "../http";
import {
  conversionFilters,
  type ConversionFilters,
} from "../lib/conversion-filters";
import { reportPeriod, unknownValue } from "../lib/report-filters";
import { goalMatch } from "./conversion-match";
import { segmentFilter, trafficSource } from "./report-filter";
import type { Env } from "../types";
import { requireSiteView } from "./access";

type Counts = {
  sessions: number;
  convertedSessions: number;
  previousSessions: number;
  previousConvertedSessions: number;
};
export async function siteConversions(
  env: Env,
  actorUserId: string,
  siteId: string,
  input: ConversionFilters,
) {
  const filters = conversionFilters(input);
  const { db, site, safeSite } = await requireSiteView(
    env,
    actorUserId,
    siteId,
  );
  filters.timezone = site.timezone;
  const goals = await db.listGoals(siteId);
  const selected = filters.goalId
    ? goals.find((g) => g.id === filters.goalId)
    : goals.find((g) => !g.archived);
  if (filters.goalId && !selected) throw new HttpError(404, "Goal not found");
  const period = reportPeriod(filters);
  const previousStart = period.previousStart;
  const context = {
    site: safeSite,
    goals,
    selected: selected ?? null,
    filters,
    ...period,
    previousStart,
  };
  if (!selected)
    return { ...context, totals: null, rows: [], groups: 0, hasMore: false };
  const cte = sql`with active as materialized (
    select events.visitor_id,events.session_id,
      case when events.received_at>=${period.start} then 1 else 0 end as current_period,
      max(case when ${goalMatch(db, selected)} then 1 else 0 end) as converted
    from events where events.site_id=${siteId} and events.visitor_id is not null and events.session_id is not null
      and events.received_at>=${filters.compare ? previousStart : period.start} and events.received_at<${period.end}
    group by 1,2,3
  ), acquired as materialized (
    select a.*,${trafficSource} as source,
      (select p.path from events p where p.site_id=${siteId} and p.visitor_id=a.visitor_id and p.session_id=a.session_id
        and p.name='pageview' and p.received_at<case when a.current_period=1 then cast(${period.end} as bigint) else cast(${period.start} as bigint) end
        order by p.received_at,p.id limit 1) as landing
    from active a cross join events
    where events.site_id=${siteId} and events.id=(select e.id from events e
      where e.site_id=${siteId} and e.visitor_id=a.visitor_id and e.session_id=a.session_id
      order by e.received_at,e.id limit 1)
      and ${segmentFilter({ ...filters, path: undefined })}
  ), eligible as materialized (
    select * from acquired where ${filters.path === undefined ? sql`1=1` : filters.path === unknownValue ? sql`landing is null` : sql`landing=${filters.path}`}
  )`;
  const counts = sql`coalesce(sum(current_period),0) as sessions,
    coalesce(sum(case when current_period=1 then converted else 0 end),0) as "convertedSessions",
    coalesce(sum(1-current_period),0) as "previousSessions",
    coalesce(sum(case when current_period=0 then converted else 0 end),0) as "previousConvertedSessions"`;
  const key = sql.identifier(
    filters.dimension === "source" ? "source" : "landing",
  );
  const grouped = sql`${cte}, grouped as (select ${key} as key,${counts} from eligible group by ${key}),
    rated as (select *,case when sessions>0 then 1.0*"convertedSessions"/sessions end as "conversionRate" from grouped)`;
  const order = sql.identifier(filters.sort);
  const [totals, rows] = await db.batch([
    db.query<Counts & { groups: number }>(
      sql`${cte} select ${counts},(select count(*) from (select ${key} from eligible group by ${key}) keys) as groups from eligible`,
    ),
    db.query<
      Counts & { key: string | null; conversionRate: number | null }
    >(sql`${grouped} select * from rated
      order by case when ${order} is null then 1 else 0 end,${order} ${filters.direction === "asc" ? sql`asc` : sql`desc`},case when key is null then 0 else 1 end,key asc
      limit 51 offset ${filters.page * 50}`),
  ]);
  const withRates = <T extends Counts>(row: T) => ({
    ...row,
    conversionRate: row.sessions ? row.convertedSessions / row.sessions : null,
    previousConversionRate:
      filters.compare && row.previousSessions
        ? row.previousConvertedSessions / row.previousSessions
        : null,
  });
  return {
    ...context,
    totals: withRates(totals[0]),
    rows: rows.slice(0, 50).map(withRates),
    groups: totals[0].groups,
    hasMore: rows.length > 50,
  };
}
