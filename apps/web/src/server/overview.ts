import { calendarDate, shiftDate } from "../lib/report-timezone";
import { visitorDimensions } from "./visitor-dimensions";
import { goalReport } from "./goal-report";
import { activityReport } from "./activity-report";
import { trafficReport } from "./traffic-report";
import { sessionMetrics, liveActivity } from "./session-metrics";
import {
  reportFilters,
  reportPeriod,
  dimensionKeys,
  type ReportFilters,
} from "../lib/report-filters";
import { segmentFilter } from "./report-filter";
import { sql } from "drizzle-orm";
import type { Env } from "../types";
import { requireSiteView } from "./access";

export async function siteOverview(
  env: Env,
  actorUserId: string,
  siteId: string,
  input: number | ReportFilters,
  includeLive = true,
) {
  const filters = reportFilters(
    typeof input === "number" ? { days: input } : input,
  );
  const { db, site, safeSite } = await requireSiteView(
    env,
    actorUserId,
    siteId,
  );
  filters.timezone = site.timezone;

  const { asOf, start, end, days, previousStart } = reportPeriod(filters);
  const segment = segmentFilter(filters);
  const allFilter = sql`events.site_id=${siteId} and events.received_at>=${start} and events.received_at<${end} and ${segment}`;
  const customFilter = sql`${allFilter} and events.name!='pageview'`;
  type Activity = Awaited<ReturnType<typeof activityReport>>;
  const useSummaries =
    site.timezone === "UTC" &&
    !dimensionKeys.some((key) => filters[key] !== undefined);
  const [traffic, summary, previousSummary, visitorLocations] =
    await Promise.all([
      trafficReport(db, siteId, filters, start, end),
      useSummaries ? activityReport(db, siteId, start, end) : null,
      useSummaries && filters.compare
        ? activityReport(db, siteId, previousStart, start)
        : null,
      visitorDimensions(db, siteId, filters, start, end),
    ]);
  const {
    totals,
    daily,
    pages,
    sources,
    referrers,
    campaigns,
    countries,
    regions,
    cities,
    browsers,
    operatingSystems,
    devices,
  } = traffic;
  const [latest, identities, customEvents, customTotals, visitorCohorts] =
    summary
      ? [
          summary.latest,
          summary.identities,
          summary.customEvents,
          summary.customTotals,
          summary.visitorCohorts,
        ]
      : await Promise.all([
          db.all<Activity["latest"][number]>(
            sql`select max(received_at) as "receivedAt" from events where site_id=${siteId} and name='pageview' and ${segment} and received_at<${end}`,
          ),
          db.all<Activity["identities"][number]>(
            sql`select count(distinct visitor_id) as visitors,count(distinct session_id) as sessions from events where ${allFilter}`,
          ),
          db.all<Activity["customEvents"][number]>(
            sql`select name,count(*) as count,count(distinct visitor_id) as visitors,count(distinct session_id) as sessions from events where ${customFilter} group by name order by count(*) desc,name limit 20`,
          ),
          db.all<Activity["customTotals"][number]>(
            sql`select count(*) as count,count(distinct name) as names from events where ${customFilter}`,
          ),
          db.all<Activity["visitorCohorts"][number]>(sql`with active as (
          select visitor_id,count(distinct session_id) as sessions from events where ${allFilter} and visitor_id is not null group by visitor_id
        ), history as (select active.*,(select min(h.received_at) from events h where h.site_id=${siteId} and h.visitor_id=active.visitor_id) as first_seen from active)
        select count(case when first_seen>=${start} then 1 end) as "newVisitors",count(case when first_seen<${start} then 1 end) as "returningVisitors",
          count(case when sessions=1 then 1 end) as "oneSession",count(case when sessions between 2 and 3 then 1 end) as "twoOrThreeSessions",count(case when sessions>=4 then 1 end) as "fourPlusSessions" from history`),
        ]);
  const goalRows = await goalReport(
    db,
    siteId,
    filters,
    start,
    end,
    summary?.goalRows,
  );
  const seriesFor = (
    rows: { date: string; pageviews: number }[],
    from: number,
  ) => {
    const counts = new Map(rows.map((row) => [row.date, row.pageviews]));
    return Array.from({ length: days }, (_, index) => {
      const date = shiftDate(calendarDate(from, site.timezone), index);
      return { date, pageviews: counts.get(date) ?? 0 };
    });
  };
  const series = seriesFor(daily, start);
  const previousFilter = sql`events.site_id=${siteId} and events.received_at>=${previousStart} and events.received_at<${start} and ${segment}`;
  const previous = filters.compare
    ? await (async () => {
        const traffic = await trafficReport(
          db,
          siteId,
          filters,
          previousStart,
          start,
          true,
        );
        const previousIdentities =
          previousSummary?.identities ??
          (await db.all<Activity["identities"][number]>(
            sql`select count(distinct visitor_id) as visitors,count(distinct session_id) as sessions from events where ${previousFilter}`,
          ));
        const previousGoals = await goalReport(
          db,
          siteId,
          filters,
          previousStart,
          start,
          previousSummary?.goalRows,
        );
        return [
          traffic.totals,
          previousIdentities,
          traffic.daily,
          previousGoals,
        ] as const;
      })()
    : null;
  const [sessionStats, live, previousSessions] = await Promise.all([
    summary?.sessionStats ?? sessionMetrics(db, siteId, filters, start, end),
    includeLive
      ? liveActivity(db, siteId, filters, asOf)
      : Promise.resolve(null),
    filters.compare
      ? (previousSummary?.sessionStats ??
        sessionMetrics(db, siteId, filters, previousStart, start))
      : Promise.resolve(null),
  ]);
  const {
    countries: visitorCountries,
    regions: visitorRegions,
    cities: visitorCities,
    browsers: visitorBrowsers,
    operatingSystems: visitorOperatingSystems,
    devices: visitorDevices,
  } = visitorLocations;
  return {
    site: safeSite,
    filters,
    sessionStats,
    live,
    comparison: previous
      ? {
          start: previousStart,
          end: start,
          ...previous[0][0],
          identities: previous[1][0],
          sessionStats: previousSessions,
          series: seriesFor(previous[2], previousStart),
          goals: previous[3].map((goal) => ({
            id: goal.id,
            convertedSessions: goal.convertedSessions,
            conversionRate: previous[1][0].sessions
              ? goal.convertedSessions / previous[1][0].sessions
              : null,
          })),
        }
      : null,
    days,
    start,
    end,
    asOf,
    ...totals[0],
    series,
    pages,
    lastPageviewAt: latest[0].receivedAt,
    identities: identities[0],
    sources,
    referrers,
    campaigns,
    customEvents,
    customTotals: customTotals[0],
    visitorInsights: {
      countries,
      regions,
      cities,
      visitorCountries,
      visitorRegions,
      visitorCities,
      visitorBrowsers,
      visitorOperatingSystems,
      visitorDevices,
      browsers,
      operatingSystems,
      devices,
      ...visitorCohorts[0],
      sessionsPerVisitor: identities[0].visitors
        ? identities[0].sessions / identities[0].visitors
        : null,
      liveVisitors: live?.visitors ?? null,
      liveSince: asOf - 300_000,
    },
    goals: goalRows.map((goal) => ({
      ...goal,
      conversionRate: identities[0].sessions
        ? goal.convertedSessions / identities[0].sessions
        : null,
    })),
  };
}
