import { expressions } from "../db/executor";
import type { DatabaseEnv } from "../db/executor";
import { sql } from "drizzle-orm";
import { createDb } from "../db";
import { DAY } from "../lib/report-filters";
import { trafficSource } from "./report-filter";

// JSON tuples preserve nulls and compound dimensions without sentinel collisions.
export const trafficDimensions = (
  db: Pick<ReturnType<typeof createDb>, "expr">,
) => ({
  page: sql`${db.expr.jsonArray(sql`path`)}`,
  source: sql`${db.expr.jsonArray(sql`${trafficSource}`)}`,
  referrer: sql`${db.expr.jsonArray(sql`referrer_host`)}`,
  campaign: sql`${db.expr.jsonArray(sql`utm_source,utm_medium,utm_campaign`)}`,
  country: sql`${db.expr.jsonArray(sql`country`)}`,
  region: sql`${db.expr.jsonArray(sql`country,region`)}`,
  city: sql`${db.expr.jsonArray(sql`country,region,city`)}`,
  browser: sql`${db.expr.jsonArray(sql`browser`)}`,
  os: sql`${db.expr.jsonArray(sql`os`)}`,
  device: sql`${db.expr.jsonArray(sql`device`)}`,
});
export type TrafficDimension = keyof ReturnType<typeof trafficDimensions>;

export function dayStatements(
  siteId: string,
  day: number,
  now = Date.now(),
  db = { expr: expressions("d1") },
) {
  if (
    !siteId ||
    !Number.isSafeInteger(day) ||
    day < 0 ||
    day % DAY !== 0 ||
    day + DAY > now
  )
    throw new Error("Rollups require a complete UTC day");
  return [
    sql`delete from daily_traffic where site_id=${siteId} and day=${day}`,
    ...Object.entries(trafficDimensions(db)).map(
      ([dimension, key]) => sql`
      insert into daily_traffic(site_id,day,dimension,key,pageviews,identified)
      select ${siteId},${day},${dimension},${key},count(*),count(visitor_id)
      from events where site_id=${siteId} and received_at>=${day} and received_at<${day + DAY} and name='pageview'
      group by ${key}`,
    ),
    sql`delete from daily_visitor_dimensions where site_id=${siteId} and day=${day}`,
    sql`insert into daily_visitor_dimensions(site_id,day,visitor_id,country,region,city,browser,os,device)
      select distinct ${siteId},cast(${day} as bigint),visitor_id,country,region,city,browser,os,device
      from events where site_id=${siteId} and received_at>=${day} and received_at<${day + DAY}
        and name='pageview' and visitor_id is not null`,
    sql`delete from daily_activity where site_id=${siteId} and day=${day}`,
    sql`insert into daily_activity(site_id,day,key,visitor_id,session_id,name,events,first_at,last_at,first_id,last_id,first_path,last_path)
      with ranked as (
        select *,row_number() over(partition by visitor_id,session_id,name order by received_at,id) as first_rank,
          row_number() over(partition by visitor_id,session_id,name order by received_at desc,id desc) as last_rank
        from events where site_id=${siteId} and received_at>=${day} and received_at<${day + DAY}
      ) select ${siteId},${day},${db.expr.jsonArray(sql`visitor_id,session_id,name`)},visitor_id,session_id,name,count(*),min(received_at),max(received_at),
        max(case when first_rank=1 then id end),max(case when last_rank=1 then id end),
        max(case when first_rank=1 then path end),max(case when last_rank=1 then path end)
      from ranked group by visitor_id,session_id,name`,
    sql`insert into session_summaries(site_id,visitor_id,session_id,started,ended,views,custom_events,entry_path,exit_path)
      with eligible as materialized (
        select distinct visitor_id,session_id from events where site_id=${siteId} and received_at>=${day} and received_at<${day + DAY}
          and visitor_id is not null and session_id is not null
      ) select ${siteId},e.visitor_id,e.session_id,min(e.received_at),max(e.received_at),
        sum(case when e.name='pageview' then 1 else 0 end),sum(case when e.name!='pageview' then 1 else 0 end),
        (select path from events p where p.site_id=${siteId} and p.visitor_id=e.visitor_id and p.session_id=e.session_id and p.name='pageview' order by p.received_at,p.id limit 1),
        (select path from events p where p.site_id=${siteId} and p.visitor_id=e.visitor_id and p.session_id=e.session_id and p.name='pageview' order by p.received_at desc,p.id desc limit 1)
      from eligible k cross join events e where e.site_id=${siteId} and e.visitor_id=k.visitor_id and e.session_id=k.session_id
      group by e.visitor_id,e.session_id
      on conflict(site_id,visitor_id,session_id) do update set started=excluded.started,ended=excluded.ended,views=excluded.views,
        custom_events=excluded.custom_events,entry_path=excluded.entry_path,exit_path=excluded.exit_path`,
    sql`insert into rollup_days(site_id,day,completed_at) values(${siteId},${day},${now})
      on conflict(site_id,day) do update set completed_at=excluded.completed_at`,
    sql`delete from rollup_pending where site_id=${siteId} and day=${day}`,
  ];
}
export async function rebuildDay(
  env: DatabaseEnv,
  siteId: string,
  day: number,
  now = Date.now(),
) {
  const db = createDb(env);
  await db.atomic([
    ...(db.provider === "postgres"
      ? [sql`select id from sites where id=${siteId} for update`]
      : []),
    ...dayStatements(siteId, day, now, db),
  ]);
}
export function missingDaysQuery(now = Date.now(), limit = 14) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 366)
    throw new Error("Invalid rollup batch size");
  const today = Math.floor(now / DAY) * DAY;
  return sql`select site_id as "siteId",day from rollup_pending where day<${today}
    order by day desc,site_id limit ${limit}`;
}
export async function refreshRollups(
  env: DatabaseEnv,
  now = Date.now(),
  limit = 14,
) {
  const db = createDb(env);
  // Discard invalidated payloads, including days removed completely by retention.
  await db.run(
    sql`delete from daily_traffic where not exists(select 1 from rollup_days r where r.site_id=daily_traffic.site_id and r.day=daily_traffic.day)`,
  );
  await db.run(
    sql`delete from daily_activity where not exists(select 1 from rollup_days r where r.site_id=daily_activity.site_id and r.day=daily_activity.day)`,
  );
  await db.run(
    sql`delete from daily_visitor_dimensions where not exists(select 1 from rollup_days r where r.site_id=daily_visitor_dimensions.site_id and r.day=daily_visitor_dimensions.day)`,
  );
  const pending = await db.all<{ siteId: string; day: number }>(
    missingDaysQuery(now, limit),
  );
  for (const row of pending) await rebuildDay(env, row.siteId, row.day, now);
  return pending.length;
}
