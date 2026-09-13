import type { ReportActor } from "./access";
import { sql } from "drizzle-orm";
import { eventFilters, type EventFilters } from "../lib/event-filters";
import type { EventProperties, PropertyValue } from "../lib/event-properties";
import { reportPeriod } from "../lib/report-filters";
import type { Env } from "../types";
import { segmentFilter } from "./report-filter";
import { requireSiteView } from "./access";

type EventRow = {
  id: string;
  name: string;
  path: string;
  receivedAt: number;
  visitorId: string | null;
  properties: string;
};
export async function siteEventExplorer(
  env: Env,
  actorUserId: ReportActor,
  siteId: string,
  input: EventFilters,
) {
  const filters = eventFilters(input);
  const { db, site, safeSite } = await requireSiteView(
    env,
    actorUserId,
    siteId,
    "events",
  );
  filters.timezone = site.timezone;
  const period = reportPeriod(filters, filters.asOf ?? Date.now());
  const pg = db.provider === "postgres";
  const each = pg
    ? sql`jsonb_each(events.properties::jsonb)`
    : sql`json_each(events.properties)`;
  const encoded = pg
    ? sql`prop.value::text`
    : sql`case prop.type when 'true' then 'true' when 'false' then 'false' else json_quote(prop.atom) end`;
  const value =
    filters.propertyValue === undefined
      ? undefined
      : (JSON.parse(filters.propertyValue.slice(5)) as PropertyValue);
  const equality =
    value === undefined
      ? sql`1=1`
      : pg
        ? sql`prop.value=${filters.propertyValue!.slice(5)}::jsonb`
        : typeof value === "boolean"
          ? sql`prop.type=${value ? "true" : "false"}`
          : sql`prop.type in (${typeof value === "number" ? sql`'integer','real'` : sql`'text'`}) and prop.atom=${value}`;
  const base = sql`events.site_id=${siteId} and events.received_at>=${period.start} and events.received_at<${period.end}
    and ${segmentFilter(filters)} ${filters.eventName ? sql`and events.name=${filters.eventName}` : sql``}`;
  const where = sql`${base} ${value === undefined ? sql`` : sql`and exists(select 1 from ${each} prop where prop.key=${filters.propertyKey} and ${equality})`}`;
  const cursor =
    filters.beforeAt === undefined
      ? sql``
      : sql`and (events.received_at<${filters.beforeAt} or (events.received_at=${filters.beforeAt} and events.id<${filters.beforeId}))`;
  const [totals, names, rows, properties] = await db.batch([
    db.query<{ total: number; visitors: number }>(
      sql`select count(*) as total,count(distinct events.visitor_id) as visitors from events where ${where}`,
    ),
    db.query<{ name: string; total: number }>(
      sql`select events.name,count(*) as total from events where ${where} group by events.name order by total desc,events.name limit 30`,
    ),
    db.query<EventRow>(
      sql`select events.id,events.name,events.path,events.received_at as "receivedAt",events.visitor_id as "visitorId",events.properties from events where ${where} ${cursor} order by events.received_at desc,events.id desc limit 51`,
    ),
    // Facets ignore the selected property value, so another value can be chosen directly.
    db.query<{ encoded: string; total: number }>(
      filters.propertyKey
        ? sql`select ${encoded} as encoded,count(*) as total from events,${each} prop where ${base} and prop.key=${filters.propertyKey} group by ${encoded} order by total desc,encoded limit 20`
        : sql`select '' as encoded,0 as total where 1=0`,
    ),
  ]);
  const page = rows.slice(0, 50);
  const last = page.at(-1);
  return {
    site: safeSite,
    filters,
    ...period,
    ...totals[0],
    names,
    events: page.map((row) => ({
      ...row,
      properties: JSON.parse(row.properties) as EventProperties,
    })),
    properties: properties.map((row) => ({
      value: JSON.parse(row.encoded) as PropertyValue,
      total: row.total,
    })),
    nextCursor:
      rows.length > 50 && last
        ? { asOf: period.asOf, beforeAt: last.receivedAt, beforeId: last.id }
        : null,
  };
}
