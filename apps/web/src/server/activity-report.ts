import { sql } from "drizzle-orm";
import { createDb } from "../db";
import { DAY } from "../lib/report-filters";
import type { sessionMetrics } from "./session-metrics";

type CustomEvent = {
  name: string;
  count: number;
  visitors: number;
  sessions: number;
};
type Goal = {
  id: string;
  name: string;
  eventName: string;
  icon: string;
  archived: boolean;
  completions: number;
  identifiedCompletions: number;
  convertedSessions: number;
};
type Cohorts = {
  newVisitors: number;
  returningVisitors: number;
  oneSession: number;
  twoOrThreeSessions: number;
  fourPlusSessions: number;
};
export async function activityReport(
  db: ReturnType<typeof createDb>,
  siteId: string,
  start: number,
  end: number,
) {
  const [row] = await db.all<{
    latest: number | null;
    identities: string;
    customEvents: string;
    customTotals: string;
    goals: string;
    cohorts: string;
    sessionStats: string;
  }>(sql`with covered as materialized (
   select day from rollup_days where site_id=${siteId} and day>=${start} and day+${DAY}<=${end}
 ), uncovered as materialized (
   select day from rollup_pending where site_id=${siteId} and day>=${start} and day<${end}
 ), period as materialized (
   select visitor_id,session_id,name,events
   from covered c cross join daily_activity a where a.site_id=${siteId} and a.day=c.day
   union all
   select e.visitor_id,e.session_id,e.name,1
   from uncovered u cross join events e where e.site_id=${siteId} and e.received_at>=u.day and e.received_at<${db.expr.least(sql`u.day+${DAY}`, sql`${end}`)}
 ),
 visitors as materialized (
   select visitor_id,count(distinct session_id) as sessions from period where visitor_id is not null group by visitor_id
 ), named as materialized (
   select name,sum(events) as completions,sum(case when session_id is not null then events else 0 end) as identified,
     count(distinct session_id) as sessions,count(distinct visitor_id) as visitors from period group by name
 ), eligible as materialized (
   select distinct visitor_id,session_id from period where visitor_id is not null and session_id is not null
 ), uncached as materialized (
   select k.* from eligible k where not exists(
     select 1 from session_summaries c where c.site_id=${siteId}
       and c.visitor_id=k.visitor_id and c.session_id=k.session_id and c.ended<${end}
   )
 ), sessions as materialized (
   select c.visitor_id,c.session_id,c.started,c.ended,c.views,c.custom_events as "customEvents",c.entry_path,c.exit_path
   from eligible k cross join session_summaries c where c.site_id=${siteId} and c.visitor_id=k.visitor_id and c.session_id=k.session_id and c.ended<${end}
   union all
   select e.visitor_id,e.session_id,min(e.received_at),max(e.received_at),sum(case when e.name='pageview' then 1 else 0 end),sum(case when e.name!='pageview' then 1 else 0 end),
     (select path from events p where p.site_id=${siteId} and p.visitor_id=e.visitor_id and p.session_id=e.session_id and p.name='pageview' and p.received_at<${end} order by p.received_at,p.id limit 1),
     (select path from events p where p.site_id=${siteId} and p.visitor_id=e.visitor_id and p.session_id=e.session_id and p.name='pageview' and p.received_at<${end} order by p.received_at desc,p.id desc limit 1)
   from uncached k cross join events e
   where e.site_id=${siteId} and e.visitor_id=k.visitor_id and e.session_id=k.session_id and e.received_at<${end}
   group by e.visitor_id,e.session_id
 ), stats as (
   select count(*) as sessions,count(case when views>0 then 1 end) as "pageviewSessions",
    count(case when views=1 and "customEvents"=0 then 1 end) as "bouncedSessions",avg(ended-started) as "averageDurationMs" from sessions
 ) select
   (select received_at from events where site_id=${siteId} and name='pageview' and received_at<${end} order by received_at desc limit 1) as latest,
   (select ${db.expr.jsonObject(sql`'visitors',count(distinct visitor_id),'sessions',count(distinct session_id)`)} from period) as identities,
   (select ${db.expr.jsonGroupArray(sql`${db.expr.jsonObject(sql`'name',name,'count',completions,'visitors',visitors,'sessions',sessions`)}`)} from (
     select * from named where name!='pageview' order by completions desc,name limit 20)) as "customEvents",
   (select ${db.expr.jsonObject(sql`'count',coalesce(sum(completions),0),'names',count(*)`)} from named where name!='pageview') as "customTotals",
   (select ${db.expr.jsonGroupArray(
     sql`${db.expr
       .jsonObject(sql`'id',id,'name',name,'eventName',event_name,'icon',icon,'archived',archived,
      'completions',completions,'identifiedCompletions',identified,'convertedSessions',sessions`)}`,
   )} from (
     select g.id,g.name,g.event_name,g.icon,g.archived,coalesce(n.completions,0) as completions,coalesce(n.identified,0) as identified,coalesce(n.sessions,0) as sessions
     from goals g left join named n on n.name=g.event_name where g.site_id=${siteId} and g.path is null and g.conditions='{}' order by g.created_at,g.id)) as goals,
   (select ${db.expr
     .jsonObject(sql`'newVisitors',count(case when h.first_at>=${start} then 1 end),
     'returningVisitors',count(case when h.first_at<${start} then 1 end),
     'oneSession',count(case when v.sessions=1 then 1 end),'twoOrThreeSessions',count(case when v.sessions between 2 and 3 then 1 end),
     'fourPlusSessions',count(case when v.sessions>=4 then 1 end)`)}
     from visitors v cross join visitor_first_seen h where h.site_id=${siteId} and h.visitor_id=v.visitor_id) as cohorts,
   (select ${db.expr
     .jsonObject(sql`'sessions',sessions,'pageviewSessions',"pageviewSessions",'bouncedSessions',"bouncedSessions",
     'averageDurationMs',"averageDurationMs",'bounceRate',case when "pageviewSessions">0 then 1.0*"bouncedSessions"/"pageviewSessions" end,
     'entryPages',${db.expr
       .json(sql`(select ${db.expr.jsonGroupArray(sql`${db.expr.jsonObject(sql`'path',entry_path,'sessions',total`)}`)} from (
       select entry_path,count(*) as total from sessions where entry_path is not null group by entry_path order by total desc,entry_path limit 10))`)},
     'exitPages',${db.expr
       .json(sql`(select ${db.expr.jsonGroupArray(sql`${db.expr.jsonObject(sql`'path',exit_path,'sessions',total`)}`)} from (
       select exit_path,count(*) as total from sessions where exit_path is not null group by exit_path order by total desc,exit_path limit 10))`)}`)} from stats) as "sessionStats"`);
  return {
    latest: [{ receivedAt: row.latest }],
    identities: [
      JSON.parse(row.identities) as { visitors: number; sessions: number },
    ],
    customEvents: JSON.parse(row.customEvents) as CustomEvent[],
    customTotals: [
      JSON.parse(row.customTotals) as { count: number; names: number },
    ],
    goalRows: (JSON.parse(row.goals) as Goal[]).map((goal) => ({
      ...goal,
      archived: Boolean(goal.archived),
    })),
    visitorCohorts: [JSON.parse(row.cohorts) as Cohorts],
    sessionStats: JSON.parse(row.sessionStats) as Awaited<
      ReturnType<typeof sessionMetrics>
    >,
  };
}
