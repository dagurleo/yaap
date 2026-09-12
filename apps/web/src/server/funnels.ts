import { ownedSite, requireSiteView } from "./access";
import { propertyMatch } from "./conversion-match";
import { sql } from "drizzle-orm";
import { createDb } from "../db";
import { HttpError } from "../http";
import {
  validateFunnel,
  type FunnelInput,
  type FunnelStep,
} from "../lib/funnels";
import {
  reportFilters,
  reportPeriod,
  type ReportFilters,
} from "../lib/report-filters";
import { segmentFilter } from "./report-filter";
import type { Env } from "../types";

export async function saveFunnel(
  env: Env,
  ownerId: string,
  siteId: string,
  input: FunnelInput,
  id?: string,
) {
  const { db } = await ownedSite(env, ownerId, siteId);
  const values = validateFunnel(input);
  const now = Date.now();
  if (id !== undefined) {
    if (typeof id !== "string" || !id || id.length > 128)
      throw new HttpError(400, "Invalid funnel");
    const updated = await db.updateFunnel(siteId, id, {
      ...values,
      updatedAt: now,
    });
    if (!updated) throw new HttpError(404, "Funnel not found");
    return updated;
  }
  const created = await db.createFunnel({
    ...values,
    id: crypto.randomUUID(),
    siteId,
    createdAt: now,
    updatedAt: now,
  });
  return created;
}
export async function archiveFunnel(
  env: Env,
  ownerId: string,
  siteId: string,
  id: string,
  archived: boolean,
) {
  const { db } = await ownedSite(env, ownerId, siteId);
  if (typeof archived !== "boolean")
    throw new HttpError(400, "Invalid archive state");
  const updated = await db.updateFunnel(siteId, id, {
    archived,
    updatedAt: Date.now(),
  });
  if (!updated) throw new HttpError(404, "Funnel not found");
  return updated;
}
async function funnelCounts(
  db: ReturnType<typeof createDb>,
  siteId: string,
  funnel: FunnelInput,
  filters: ReportFilters,
  start: number,
  end: number,
) {
  const match = (step: FunnelStep, alias = "e") => {
    const table = sql.identifier(alias);
    return sql`${table}.name=${step.kind === "page" ? "pageview" : step.value}
      ${step.kind === "page" ? sql`and ${table}.path=${step.value}` : sql``}
      and ${propertyMatch(db, step.conditions, alias)}`;
  };
  // Seek the next matching event through the site/visitor/time indexes.
  // Materialized stages contain attempts only; never rescan a materialized copy
  // of every visitor's events for every attempt (quadratic on PostgreSQL).
  const stages = [
    sql`stage_0 as materialized (
    select events.visitor_id as "visitorId",events.session_id as "sessionId",
      events.received_at as "enteredAt",events.received_at as "receivedAt",events.id
    from events where events.site_id=${siteId} and events.visitor_id is not null
      and events.received_at>=${start} and events.received_at<${end}
      and ${segmentFilter(filters)} and ${match(funnel.steps[0], "events")}
      ${funnel.scope === "session" ? sql`and events.session_id is not null` : sql``})`,
  ];
  for (let index = 1; index < funnel.steps.length; index++) {
    const previous = sql.identifier(`stage_${index - 1}`);
    const candidates = sql.identifier(`next_${index}`);
    stages.push(sql`${candidates} as materialized (
      select p.*, (select e.id from events e
        where e.site_id=${siteId} and e.visitor_id=p."visitorId"
          and e.received_at>=p."receivedAt" and e.received_at<${end}
          and e.received_at<=p."enteredAt"+${funnel.windowHours * 3600000}
          and (e.received_at>p."receivedAt" or e.id>p.id)
          and ${match(funnel.steps[index])}
          ${funnel.scope === "session" ? sql`and e.session_id=p."sessionId"` : sql``}
        order by e.received_at,e.id limit 1) as "nextId"
      from ${previous} p)`);
    stages.push(sql`${sql.identifier(`stage_${index}`)} as materialized (
      select p."visitorId",p."sessionId",p."enteredAt",e.received_at as "receivedAt",e.id
      from ${candidates} p cross join events e where e.site_id=${siteId} and e.id=p."nextId")`);
  }
  const selects = funnel.steps.map(
    (_, index) => sql`(select count(distinct ${
      funnel.scope === "session"
        ? db.expr.jsonArray(sql`"visitorId", "sessionId"`)
        : sql`"visitorId"`
    })
    from ${sql.identifier(`stage_${index}`)}) as ${sql.identifier(`count_${index}`)}`,
  );
  const [row] = await db.all<Record<string, number>>(
    sql`with ${sql.join(stages, sql`, `)} select ${sql.join(selects, sql`, `)}`,
  );
  const counts = funnel.steps.map((_, index) => ({
    count: row[`count_${index}`],
  }));
  const entrants = counts[0].count;
  return {
    entrants,
    completed: counts.at(-1)!.count,
    conversionRate: entrants ? counts.at(-1)!.count / entrants : null,
    steps: funnel.steps.map((step, index) => {
      const reached = counts[index].count;
      const previous = index ? counts[index - 1].count : entrants;
      return {
        ...step,
        reached,
        conversionRate: entrants ? reached / entrants : null,
        stepConversionRate: previous ? reached / previous : null,
        dropOff: index ? previous - reached : 0,
        dropOffRate: previous ? (previous - reached) / previous : null,
      };
    }),
  };
}
export async function siteFunnels(
  env: Env,
  actorUserId: string,
  siteId: string,
  input: ReportFilters,
  funnelId?: string,
) {
  const filters = reportFilters(input);
  const { db, site, safeSite } = await requireSiteView(
    env,
    actorUserId,
    siteId,
  );
  filters.timezone = site.timezone;
  const definitions = await db.listFunnels(siteId);
  const selected = funnelId
    ? definitions.find((row) => row.id === funnelId)
    : definitions.find((row) => !row.archived);
  if (funnelId && !selected) throw new HttpError(404, "Funnel not found");
  const period = reportPeriod(filters);
  if (!selected)
    return {
      site: safeSite,
      filters,
      ...period,
      definitions,
      selected: null,
      results: null,
      comparison: null,
    };
  const previousStart = period.previousStart;
  const [results, comparison] = await Promise.all([
    funnelCounts(db, siteId, selected, filters, period.start, period.end),
    filters.compare
      ? funnelCounts(db, siteId, selected, filters, previousStart, period.start)
      : Promise.resolve(null),
  ]);
  return {
    site: safeSite,
    filters,
    ...period,
    definitions,
    selected,
    results,
    comparison,
  };
}
