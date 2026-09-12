import { sql } from "drizzle-orm";
import type { createDb } from "../db";
import { DAY, dimensionKeys, type ReportFilters } from "../lib/report-filters";
import { segmentFilter } from "./report-filter";

const dimensions = {
  countries: ["country"],
  regions: ["country", "region"],
  cities: ["country", "region", "city"],
  browsers: ["browser"],
  operatingSystems: ["os"],
  devices: ["device"],
} as const;
type Results = {
  [K in keyof typeof dimensions]: (Record<
    (typeof dimensions)[K][number],
    string | null
  > & { visitors: number })[];
};

export async function visitorDimensions(
  db: ReturnType<typeof createDb>,
  siteId: string,
  filters: ReportFilters,
  start: number,
  end: number,
): Promise<Results> {
  const filtered =
    (filters.timezone !== undefined && filters.timezone !== "UTC") ||
    dimensionKeys.some((key) => filters[key] !== undefined);
  const columns = sql`visitor_id,country,region,city,browser,os,device`;
  // Materialize once for all six panels. A visitor can have multiple dimension
  // tuples and occur on several days; COUNT(DISTINCT) preserves range uniques.
  const facts = filtered
    ? sql`with facts as materialized (
        select distinct ${columns} from events where site_id=${siteId}
          and received_at>=${start} and received_at<${end}
          and name='pageview' and visitor_id is not null and ${segmentFilter(filters)}
      )`
    : sql`with recursive days(day) as (
        select cast(${start} as bigint) union all select day+${DAY} from days where day+${DAY}<${end}
      ), covered as materialized (
        select day from rollup_days where site_id=${siteId} and day>=${start} and day<=${end - DAY}
      ), uncovered as materialized (
        select day from days where not exists(select 1 from covered c where c.day=days.day)
      ), facts as materialized (
        select ${columns} from covered c cross join daily_visitor_dimensions d
          where d.site_id=${siteId} and d.day=c.day
        union
        select ${columns} from uncovered u cross join events e
          where e.site_id=${siteId} and e.received_at>=u.day
            and e.received_at<${db.expr.least(sql`u.day+${DAY}`, sql`${end}`)}
            and e.name='pageview' and e.visitor_id is not null
      )`;
  const panels = Object.entries(dimensions).map(([name, fields]) => {
    const grouping = sql.join(
      fields.map((field) => sql.identifier(field)),
      sql`,`,
    );
    const pairs = sql.join(
      fields.map(
        (field) => sql`cast(${field} as text),${sql.identifier(field)}`,
      ),
      sql`,`,
    );
    return sql`(select ${db.expr.jsonGroupArray(db.expr.jsonObject(sql`${pairs},'visitors',visitors`))}
      from (select ${grouping},count(distinct visitor_id) as visitors from facts
        group by ${grouping} order by visitors desc,${grouping} limit 10) ranked) as ${sql.identifier(name)}`;
  });
  const [row] = await db.all<Record<keyof Results, string>>(
    sql`${facts} select ${sql.join(panels, sql`,`)}`,
  );
  return Object.fromEntries(
    Object.entries(row).map(([name, value]) => [name, JSON.parse(value)]),
  ) as Results;
}
