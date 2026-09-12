import { and, isNull, sql } from "drizzle-orm";
const events = Object.fromEntries(
  Object.entries({
    trackingVersion: "tracking_version",
    utmSource: "utm_source",
    referrerHost: "referrer_host",
    country: "country",
    path: "path",
    browser: "browser",
    os: "os",
    device: "device",
    utmCampaign: "utm_campaign",
    region: "region",
    city: "city",
  }).map(([key, column]) => [
    key,
    sql`${sql.identifier("events")}.${sql.identifier(column)}`,
  ]),
);
import {
  dimensionKeys,
  unknownValue,
  type ReportFilters,
} from "../lib/report-filters";
export const trafficSource = sql<string>`case when ${events.trackingVersion} = 1 then 'Not recorded'
  when ${events.utmSource} is not null then 'Campaign · ' || ${events.utmSource}
  when ${events.referrerHost} is not null then 'Referral · ' || ${events.referrerHost}
  else 'Direct / unknown' end`;
const columns = {
  country: events.country,
  path: events.path,
  browser: events.browser,
  source: trafficSource,
  os: events.os,
  device: events.device,
  referrer: events.referrerHost,
  campaign: events.utmCampaign,
  region: events.region,
  city: events.city,
};
export function segmentFilter(filters: ReportFilters) {
  return (
    and(
      ...dimensionKeys.flatMap((key) =>
        filters[key] === undefined
          ? []
          : [
              filters[key] === unknownValue
                ? isNull(columns[key])
                : sql`${columns[key]} = ${filters[key]!}`,
            ],
      ),
    ) ?? sql`1=1`
  );
}
