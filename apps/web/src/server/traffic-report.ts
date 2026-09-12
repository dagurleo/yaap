import { calendarBuckets } from "../lib/report-timezone";
import type { ReadQuery } from "../db/executor";
import { sql } from "drizzle-orm";
import { createDb } from "../db";
import { DAY, dimensionKeys, type ReportFilters } from "../lib/report-filters";
import { segmentFilter, trafficSource } from "./report-filter";
import { trafficDimensions, type TrafficDimension } from "./rollups";

// Return all panels in one statement/snapshot. PostgreSQL batch() otherwise
// sends a separate round trip for every panel, even when rollup reads are tiny.
const panelColumns = [
  ["pageviews", "pagesViewed", "identifiedPageviews"],
  ["date", "pageviews"],
  ["path", "pageviews"],
  ["source", "pageviews"],
  ["host", "pageviews"],
  ["source", "medium", "campaign", "pageviews"],
  ["country", "pageviews"],
  ["country", "region", "pageviews"],
  ["country", "region", "city", "pageviews"],
  ["browser", "pageviews"],
  ["os", "pageviews"],
  ["device", "pageviews"],
];
async function trafficRows<const Q extends readonly ReadQuery<unknown>[]>(
  db: ReturnType<typeof createDb>,
  queries: Q,
  summaryOnly: boolean,
) {
  const selected = summaryOnly ? queries.slice(0, 2) : queries;
  // D1 caps bound parameters per statement; its batch is already one RPC.
  if (db.provider === "d1") {
    const rows = await db.batch(selected);
    return queries.map((_, index) => rows[index] ?? []) as {
      [K in keyof Q]: Q[K] extends ReadQuery<infer T> ? T[] : never;
    };
  }
  const panels = selected.map((query, index) => {
    const pairs = sql.join(
      panelColumns[index].map(
        (field) => sql`cast(${field} as text),${sql.identifier(field)}`,
      ),
      sql`,`,
    );
    return sql`(select ${db.expr.jsonGroupArray(db.expr.jsonObject(pairs))}
      from (${query.sql}) panel) as ${sql.identifier(`panel${index}`)}`;
  });
  const [row] = await db.all<Record<string, string>>(
    sql`select ${sql.join(panels, sql`,`)}`,
  );
  return queries.map((_, index) =>
    JSON.parse(row[`panel${index}`] ?? "[]"),
  ) as {
    [K in keyof Q]: Q[K] extends ReadQuery<infer T> ? T[] : never;
  };
}

async function rawTraffic(
  db: ReturnType<typeof createDb>,
  siteId: string,
  filters: ReportFilters,
  start: number,
  end: number,
  summaryOnly = false,
) {
  const filter = sql`site_id=${siteId} and received_at>=${start} and received_at<${end} and ${segmentFilter(filters)} and name='pageview'`;
  const group = <T>(
    fields: ReturnType<typeof sql>,
    columns: ReturnType<typeof sql>,
    condition = sql`1=1`,
  ) =>
    db.query<T>(
      sql`select ${fields},count(*) as pageviews from events where ${filter} and ${condition} group by ${columns} order by count(*) desc,${columns} limit 10`,
    );
  const timezone = filters.timezone ?? "UTC";
  const buckets = JSON.stringify(
    timezone === "UTC" ? [] : calendarBuckets(start, end, timezone),
  );
  const localDaily =
    db.provider === "postgres"
      ? sql`select b.date,count(*) as pageviews from json_to_recordset(cast(${buckets} as json)) as b(date text,start bigint,"end" bigint)
        cross join events where ${filter} and received_at>=b.start and received_at<b."end" group by b.date order by b.date`
      : sql`select json_extract(b.value,'$.date') as date,count(*) as pageviews from json_each(${buckets}) b
        cross join events where ${filter} and received_at>=json_extract(b.value,'$.start') and received_at<json_extract(b.value,'$.end') group by date order by date`;
  const queries = [
    db.query<{
      pageviews: number;
      pagesViewed: number;
      identifiedPageviews: number;
    }>(
      sql`select count(*) as pageviews,count(distinct path) as "pagesViewed",count(visitor_id) as "identifiedPageviews" from events where ${filter}`,
    ),
    db.query<{ date: string; pageviews: number }>(
      timezone === "UTC"
        ? sql`select ${db.expr.date(sql`received_at`)} as date,count(*) as pageviews from events where ${filter} group by date order by date`
        : localDaily,
    ),
    group<{ path: string; pageviews: number }>(sql`path`, sql`path`),
    group<{ source: string; pageviews: number }>(
      sql`${trafficSource} as source`,
      trafficSource,
    ),
    group<{ host: string | null; pageviews: number }>(
      sql`referrer_host as host`,
      sql`referrer_host`,
      sql`referrer_host is not null`,
    ),
    group<{
      source: string | null;
      medium: string | null;
      campaign: string | null;
      pageviews: number;
    }>(
      sql`utm_source as source,utm_medium as medium,utm_campaign as campaign`,
      sql`utm_campaign,utm_source,utm_medium`,
      sql`utm_campaign is not null`,
    ),
    group<{ country: string | null; pageviews: number }>(
      sql`country`,
      sql`country`,
    ),
    group<{ country: string | null; region: string | null; pageviews: number }>(
      sql`country,region`,
      sql`country,region`,
    ),
    group<{
      country: string | null;
      region: string | null;
      city: string | null;
      pageviews: number;
    }>(sql`country,region,city`, sql`country,region,city`),
    group<{ browser: string | null; pageviews: number }>(
      sql`browser`,
      sql`browser`,
    ),
    group<{ os: string | null; pageviews: number }>(sql`os`, sql`os`),
    group<{ device: string | null; pageviews: number }>(
      sql`device`,
      sql`device`,
    ),
  ] as const;
  const [
    totals,
    daily,
    pages = [],
    sources = [],
    referrers = [],
    campaigns = [],
    countries = [],
    regions = [],
    cities = [],
    browsers = [],
    operatingSystems = [],
    devices = [],
  ] = await trafficRows(db, queries, summaryOnly);
  return {
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
  };
}

export async function trafficReport(
  db: ReturnType<typeof createDb>,
  siteId: string,
  filters: ReportFilters,
  start: number,
  end: number,
  summaryOnly = false,
) {
  // Independent dimension summaries cannot answer intersections of dimensions.
  if (
    (filters.timezone !== undefined && filters.timezone !== "UTC") ||
    dimensionKeys.some((key) => filters[key] !== undefined)
  )
    return rawTraffic(db, siteId, filters, start, end, summaryOnly);
  const facts = (
    dimension: TrafficDimension,
  ) => sql`with recursive days(day) as (
    select cast(${start} as bigint) union all select day+${DAY} from days where day+${DAY}<${end}
  ), covered as materialized (
    select day from rollup_days where site_id=${siteId} and day>=${start} and day+${DAY}<=${end}
  ), uncovered as materialized (
    select day from days where not exists(select 1 from covered c where c.day=days.day)
  ), facts as (
    select t.day,t.key,t.pageviews,t.identified from daily_traffic t
    where t.site_id=${siteId} and t.dimension=${dimension} and t.day>=${start} and t.day<${end}
      and exists(select 1 from covered c where c.day=t.day)
    union all
    select u.day,${trafficDimensions(db)[dimension]} as key,count(*) as pageviews,count(visitor_id) as identified
    from uncovered u cross join events
    where events.site_id=${siteId} and received_at>=u.day and received_at<${db.expr.least(sql`u.day+${DAY}`, sql`${end}`)} and name='pageview'
    group by u.day,key
  )`;
  const column = (position: number) => db.expr.jsonExtract(sql`key`, position);
  const group = (
    dimension: TrafficDimension,
    columns: Record<string, number>,
    condition = sql`1=1`,
    tie?: ReturnType<typeof sql>,
  ) => {
    const entries = Object.entries(columns);
    const fields = sql.join(
      entries.map(
        ([name, pos]) => sql`${column(pos)} as ${sql.identifier(name)}`,
      ),
      sql`, `,
    );
    const grouping = sql.join(
      entries.map(([, pos]) => column(pos)),
      sql`, `,
    );
    return sql`${facts(dimension)} select ${fields},sum(pageviews) as pageviews from facts where ${condition}
      group by ${grouping} order by sum(pageviews) desc,${tie ?? grouping} limit 10`;
  };
  type Raw = Awaited<ReturnType<typeof rawTraffic>>;
  const queries = [
    db.query<Raw["totals"][number]>(
      sql`${facts("page")} select coalesce(sum(pageviews),0) as pageviews,count(distinct key) as "pagesViewed",coalesce(sum(identified),0) as "identifiedPageviews" from facts`,
    ),
    db.query<Raw["daily"][number]>(
      sql`${facts("page")} select ${db.expr.date(sql`day`)} as date,sum(pageviews) as pageviews from facts group by day order by day`,
    ),
    db.query<Raw["pages"][number]>(group("page", { path: 0 })),
    db.query<Raw["sources"][number]>(group("source", { source: 0 })),
    db.query<Raw["referrers"][number]>(
      group("referrer", { host: 0 }, sql`${column(0)} is not null`),
    ),
    db.query<Raw["campaigns"][number]>(
      group(
        "campaign",
        { source: 0, medium: 1, campaign: 2 },
        sql`${column(2)} is not null`,
        sql`${column(2)},${column(0)},${column(1)}`,
      ),
    ),
    db.query<Raw["countries"][number]>(group("country", { country: 0 })),
    db.query<Raw["regions"][number]>(
      group("region", { country: 0, region: 1 }),
    ),
    db.query<Raw["cities"][number]>(
      group("city", { country: 0, region: 1, city: 2 }),
    ),
    db.query<Raw["browsers"][number]>(group("browser", { browser: 0 })),
    db.query<Raw["operatingSystems"][number]>(group("os", { os: 0 })),
    db.query<Raw["devices"][number]>(group("device", { device: 0 })),
  ];
  const result = await trafficRows(db, queries, summaryOnly);
  const [
    totals,
    daily,
    pages = [],
    sources = [],
    referrers = [],
    campaigns = [],
    countries = [],
    regions = [],
    cities = [],
    browsers = [],
    operatingSystems = [],
    devices = [],
  ] = result as [
    Raw["totals"],
    Raw["daily"],
    Raw["pages"],
    Raw["sources"],
    Raw["referrers"],
    Raw["campaigns"],
    Raw["countries"],
    Raw["regions"],
    Raw["cities"],
    Raw["browsers"],
    Raw["operatingSystems"],
    Raw["devices"],
  ];
  return {
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
  };
}
