import { calendarDate, shiftDate } from "../lib/report-timezone";
import { sql } from "drizzle-orm";
import { createDb } from "../db";
import { trafficReport } from "../server/traffic-report";
import { sessionMetrics, liveActivity } from "../server/session-metrics";
import { goalMatch, propertyMatch } from "../server/conversion-match";
import { siteFunnels } from "../server/funnels";
import { visitorJourney } from "../server/visitors";
import {
  attributionColumns,
  reconcilePaymentAttribution,
} from "../server/payment-attribution";
import { revenueFrom } from "../server/revenue";
import { segmentFilter, trafficSource } from "../server/report-filter";
import { dimensionKeys, type Dimension } from "../lib/report-filters";
import { validPropertyKey, validPropertyValue } from "../lib/event-properties";
import {
  ApiError,
  choice,
  cursorCodec,
  dates,
  integer,
  invalid,
  page,
  str,
  type Input,
  type Result,
} from "./contracts";
import type { MutationContext } from "./mutations";

export async function reports(ctx: MutationContext): Promise<Result> {
  const { env, principal: p, operation: op, input: q, siteId } = ctx,
    db = createDb(env);
  const site = await db.findSite(siteId!, p.ownerId);
  if (!site) throw new ApiError(404, "not_found", "Website not found");
  const limit = integer(q.limit, 50, 100),
    cursor = cursorCodec(env, [p.id, op, site.id, site.timezone], q);
  const canVisitors = p.scopes.includes("visitors:read");
  const redact = (row: Input) => {
    const result = { ...row };
    if (!canVisitors) {
      delete result.visitorId;
      delete result.sessionId;
    }
    return result;
  };
  if (op === "get_live") {
    const day = calendarDate(Date.now(), site.timezone),
      period = dates(
        { ...q, from: day, to: day },
        Date.now(),
        true,
        site.timezone,
      );
    const live = await liveActivity(db, site.id, period.filters);
    return {
      data: {
        online: {
          visitors: live.online.visitors,
          since: live.online.since,
          ...(canVisitors ? { rows: live.online.rows } : {}),
        },
        recent: {
          visitors: live.visitors,
          since: live.since,
          ...(canVisitors ? { rows: live.rows } : {}),
        },
      },
      meta: {
        asOf: live.asOf,
        onlineScope: "website",
        recentScope: "filtered",
      },
    };
  }
  if (op === "get_event") {
    const [row] = await db.all<Input>(
      sql`select id,name,path,received_at as "receivedAt",visitor_id as "visitorId",session_id as "sessionId",properties from events where site_id=${site.id} and id=${str(q, "eventId")}`,
    );
    if (!row) throw new ApiError(404, "not_found", "Event not found");
    return {
      data: redact({
        ...row,
        properties: JSON.parse(row.properties as string),
      }),
    };
  }
  if (op === "get_visitor" || op === "get_visitor_journey") {
    const visitorId = str(q, "visitorId");
    if (op === "get_visitor") {
      const [row] = await db.all<Input>(
        sql`select min(received_at) as "firstSeen",max(received_at) as "lastSeen",count(*) as events,count(distinct session_id) as sessions from events where site_id=${site.id} and visitor_id=${visitorId}`,
      );
      if (row.firstSeen === null)
        throw new ApiError(404, "not_found", "Visitor not found");
      return { data: { visitorId, ...row } };
    }
    const journey = await visitorJourney(
      env,
      p.ownerId,
      site.id,
      visitorId,
      cursor.asOf,
      cursor.last
        ? { at: Number(cursor.last[0]), id: String(cursor.last[1]) }
        : undefined,
    );
    const { nextCursor, payments, ...data } = journey;
    return {
      data: {
        ...data,
        events: data.events.map((e) => ({
          ...e,
          properties: JSON.parse(e.properties),
        })),
        ...(p.scopes.includes("payments:read") ? { payments } : {}),
      },
      meta: { asOf: cursor.asOf, limit: 100 },
      pagination: {
        nextCursor: nextCursor
          ? cursor.next([nextCursor.at, nextCursor.id])
          : null,
      },
    };
  }
  if (op === "get_payment") {
    const provider = choice(q.provider, ["api", "stripe"]),
      mode = choice(q.mode, ["test", "live"]),
      externalId = str(q, "externalId", 256);
    await reconcilePaymentAttribution(env, {
      siteId: site.id,
      provider,
      mode,
      externalId,
    });
    const [row] = await db.all<Input>(
      sql`select p.external_id as "externalId",p.provider,p.mode,p.amount,p.refunded_amount as "refundedAmount",p.currency,p.paid_at as "paidAt",p.visitor_id as "visitorId",case when events.id is null then null else ${trafficSource} end as source,events.utm_campaign as campaign,events.path as "landingPage",${attributionColumns} ${revenueFrom(site.id, { days: 7, mode, page: 0 }, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)} and p.provider=${provider} and p.external_id=${externalId}`,
    );
    if (!row) throw new ApiError(404, "not_found", "Payment not found");
    return { data: redact(row) };
  }
  const period = dates(q, cursor.asOf, true, site.timezone),
    { filters, start, end } = period;
  const meta: Input = {
    from: q.from,
    to: q.to,
    start,
    end,
    asOf: period.asOf,
    timezone: site.timezone,
    partial: end < period.calendarEnd,
    comparison: filters.compare
      ? {
          start: period.previousStart,
          end: start,
          partialDayAlignment: "full_previous_calendar_period",
        }
      : null,
  };
  const where = sql`events.site_id=${site.id} and events.received_at>=${start} and events.received_at<${end} and ${segmentFilter(filters)}`;
  const identityTotals = async (a: number, b: number) => {
    const [row] = await db.all<{
      visitors: number;
      sessions: number;
      customEvents: number;
    }>(
      sql`select count(distinct visitor_id) as visitors,count(distinct session_id) as sessions,count(case when name!='pageview' then 1 end) as "customEvents" from events where site_id=${site.id} and received_at>=${a} and received_at<${b} and ${segmentFilter(filters)}`,
    );
    return row;
  };
  const sessions = async (a: number, b: number) => {
    const { averageDurationMs, ...data } = await sessionMetrics(
      db,
      site.id,
      filters,
      a,
      b,
    );
    return {
      ...data,
      averageDurationSeconds:
        averageDurationMs === null ? null : averageDurationMs / 1000,
      entryPagesLimit: 10,
      exitPagesLimit: 10,
    };
  };
  const compare = async <T>(fn: (a: number, b: number) => Promise<T>) => ({
    current: await fn(start, end),
    comparison: filters.compare ? await fn(period.previousStart, start) : null,
  });
  if (op === "get_overview") {
    const data = await compare(async (a, b) => {
      const [traffic, identities, session] = await Promise.all([
        trafficReport(db, site.id, filters, a, b, true),
        identityTotals(a, b),
        sessions(a, b),
      ]);
      return {
        ...traffic.totals[0],
        ...identities,
        sessions: identities.sessions,
        sessionMetrics: session,
      };
    });
    return { data, meta };
  }
  if (op === "get_session_report")
    return { data: await compare(sessions), meta };
  if (op === "get_timeseries") {
    choice(q.metric, ["pageviews"], "pageviews");
    return {
      data: await compare(async (a, b) => {
        const traffic = await trafficReport(db, site.id, filters, a, b, true),
          counts = new Map(
            traffic.daily.map((row) => [row.date, row.pageviews]),
          );
        return Array.from({ length: period.days }, (_, i) => {
          const date = shiftDate(calendarDate(a, site.timezone), i);
          return { date, pageviews: counts.get(date) ?? 0 };
        });
      }),
      meta,
    };
  }
  if (op === "get_audience_report") {
    const data = await compare(async (a, b) => {
      const [row] = await db.all<Input>(
        sql`with active as (select visitor_id,count(distinct session_id) as sessions from events where site_id=${site.id} and received_at>=${a} and received_at<${b} and visitor_id is not null and ${segmentFilter(filters)} group by visitor_id), history as (select active.*,(select min(h.received_at) from events h where h.site_id=${site.id} and h.visitor_id=active.visitor_id) as first_seen from active) select count(*) as visitors,count(case when first_seen>=${a} then 1 end) as "newVisitors",count(case when first_seen<${a} then 1 end) as "returningVisitors",count(case when sessions=1 then 1 end) as "oneSession",count(case when sessions between 2 and 3 then 1 end) as "twoOrThreeSessions",count(case when sessions>=4 then 1 end) as "fourPlusSessions",avg(sessions) as "sessionsPerVisitor" from history`,
      );
      return row;
    });
    return { data, meta: { ...meta, identity: "retained_browser_history" } };
  }
  if (op === "get_breakdown") {
    const dimension = choice(q.dimension, dimensionKeys),
      metric = choice(q.metric, ["pageviews", "visitors"], "pageviews");
    if (
      metric === "visitors" &&
      !["country", "region", "city", "browser", "os", "device"].includes(
        dimension,
      )
    )
      invalid(
        "Visitor breakdowns support location and technology dimensions only",
      );
    const dimensions: Record<Dimension, SQLGroup> = {
      path: [sql`path`],
      source: [trafficSource],
      referrer: [sql`referrer_host`],
      campaign: [sql`utm_source`, sql`utm_medium`, sql`utm_campaign`],
      country: [sql`country`],
      region: [sql`country`, sql`region`],
      city: [sql`country`, sql`region`, sql`city`],
      browser: [sql`browser`],
      os: [sql`os`],
      device: [sql`device`],
    };
    const cols = dimensions[dimension],
      group = sql.join(cols, sql`,`),
      selected = sql.join(
        cols.map((c, i) => sql`${c} as ${sql.identifier(`value${i}`)}`),
        sql`,`,
      ),
      count =
        metric === "pageviews"
          ? sql`count(*)`
          : sql`count(distinct visitor_id)`;
    const data = await compare(async (a, b) => {
      const base = sql`site_id=${site.id} and received_at>=${a} and received_at<${b} and name='pageview' and ${segmentFilter(filters)}`;
      const [rows, totals] = await db.batch([
        db.query<Input>(
          sql`select ${selected},${count} as value from events where ${base} group by ${group} order by value desc,${sql.join(
            cols.map((c) => sql`coalesce(${c},'')`),
            sql`,`,
          )} limit ${limit + 1}`,
        ),
        db.query<{ total: number }>(
          sql`select ${count} as total from events where ${base}`,
        ),
      ]);
      return {
        dimension,
        metric,
        rows: rows.slice(0, limit),
        total: totals[0].total,
        truncated: rows.length > limit,
      };
    });
    return { data, meta };
  }
  if (op === "get_goal_report") {
    const all = await db.listGoals(site.id),
      selected = q.goalId
        ? all.filter((g) => g.id === q.goalId)
        : all.filter((g) => !g.archived);
    if (q.goalId && !selected.length)
      throw new ApiError(404, "not_found", "Goal not found");
    if (selected.length > 100)
      invalid("Select a goalId when more than 100 goals exist");
    const data = await compare(async (a, b) => {
      const totals = await identityTotals(a, b);
      const rows = selected.length
        ? await db.batch(
            selected.map((g) =>
              db.query<Input>(
                sql`select ${g.id} as id,${g.name} as name,count(*) as completions,count(session_id) as "identifiedCompletions",count(distinct session_id) as "convertedSessions" from events where site_id=${site.id} and received_at>=${a} and received_at<${b} and ${segmentFilter(filters)} and ${goalMatch(db, g)}`,
              ),
            ),
          )
        : [];
      return rows.flat().map((row) => ({
        ...row,
        eligibleSessions: totals.sessions,
        conversionRate: totals.sessions
          ? Number(row.convertedSessions) / totals.sessions
          : null,
      }));
    });
    return { data, meta };
  }
  if (op === "get_funnel_report") {
    const data = await siteFunnels(
      env,
      p.ownerId,
      site.id,
      filters,
      str(q, "funnelId"),
    );
    return {
      data: {
        funnelId: q.funnelId,
        current: data.results,
        comparison: data.comparison,
      },
      meta,
    };
  }
  if (
    [
      "list_events",
      "list_event_names",
      "list_event_properties",
      "list_event_property_values",
      "get_event_report",
    ].includes(op)
  ) {
    if (
      q.eventName !== undefined &&
      !/^[a-zA-Z0-9_.-]{1,64}$/.test(str(q, "eventName", 64))
    )
      invalid("Invalid eventName");
    if (
      q.propertyKey !== undefined &&
      (typeof q.propertyKey !== "string" || !validPropertyKey(q.propertyKey))
    )
      invalid("Invalid propertyKey");
    let value = q.propertyValue;
    if (value !== undefined) {
      if (!q.propertyKey || !validPropertyValue(value))
        invalid("propertyValue requires a propertyKey and a scalar value");
    }
    const base = sql`${where} ${q.eventName ? sql`and name=${q.eventName}` : sql``}`;
    const match = sql`${base} ${value !== undefined ? sql`and ${propertyMatch(db, { [q.propertyKey as string]: value as string | number | boolean })}` : sql``}`;
    if (op === "list_events") {
      const rows = await db.all<Input>(
        sql`select id,name,path,received_at as "receivedAt",visitor_id as "visitorId",session_id as "sessionId",properties from events where ${match} and ${cursor.last ? sql`(received_at<${cursor.last[0]} or (received_at=${cursor.last[0]} and id<${cursor.last[1]}))` : sql`1=1`} order by received_at desc,id desc limit ${limit + 1}`,
      );
      return {
        ...page(
          rows.map((row) =>
            redact({
              ...row,
              properties: JSON.parse(row.properties as string),
            }),
          ),
          limit,
          (row) => cursor.next([row.receivedAt as number, row.id as string]),
        ),
        meta,
      };
    }
    if (op === "list_event_names") {
      const rows = await db.all<{ name: string; events: number }>(
        sql`select name,count(*) as events from events where ${match} and ${cursor.last ? sql`name>${cursor.last[0]}` : sql`1=1`} group by name order by name limit ${limit + 1}`,
      );
      return { ...page(rows, limit, (row) => cursor.next([row.name])), meta };
    }
    if (op === "get_event_report") {
      const [totals, names] = await db.batch([
        db.query<Input>(
          sql`select count(*) as events,count(distinct visitor_id) as visitors from events where ${match}`,
        ),
        db.query<Input>(
          sql`select name,count(*) as events from events where ${match} group by name order by events desc,name limit ${limit + 1}`,
        ),
      ]);
      return {
        data: {
          ...totals[0],
          names: names.slice(0, limit),
          truncated: names.length > limit,
        },
        meta,
      };
    }
    const pg = db.provider === "postgres",
      each = pg
        ? sql`jsonb_each(events.properties::jsonb)`
        : sql`json_each(events.properties)`;
    const type = pg
      ? sql`jsonb_typeof(prop.value)`
      : sql`case when prop.type in ('integer','real') then 'number' when prop.type in ('true','false') then 'boolean' else prop.type end`;
    const normalizedType = pg
      ? type
      : sql`case when ${type}='text' then 'string' else ${type} end`;
    const encoded = pg
      ? sql`prop.value::text`
      : sql`case prop.type when 'true' then 'true' when 'false' then 'false' else json_quote(prop.atom) end`;
    const key = op === "list_event_properties" ? sql`prop.key` : encoded;
    if (op === "list_event_property_values") str(q, "propertyKey", 64);
    const rows = await db.all<{ key: string; type: string; events: number }>(
      sql`select ${key} as key,${normalizedType} as type,count(*) as events from events,${each} prop where ${base} and ${op === "list_event_property_values" ? sql`prop.key=${q.propertyKey}` : sql`1=1`} and ${cursor.last ? sql`(${key}>${cursor.last[0]} or (${key}=${cursor.last[0]} and ${normalizedType}>${cursor.last[1]}))` : sql`1=1`} group by ${key},${normalizedType} order by key,type limit ${limit + 1}`,
    );
    const paged = page(rows, limit, (row) => cursor.next([row.key, row.type]));
    return {
      ...paged,
      data: (paged.data as typeof rows).map((row) =>
        op === "list_event_property_values"
          ? { value: JSON.parse(row.key), type: row.type, events: row.events }
          : row,
      ),
      meta,
    };
  }
  if (op === "list_visitors") {
    const cohort = choice(q.cohort, ["all", "new", "returning"], "all"),
      goals = await db.listGoals(site.id),
      goal = q.goalId ? goals.find((g) => g.id === q.goalId) : undefined;
    if (q.goalId && !goal)
      throw new ApiError(404, "not_found", "Goal not found");
    const rows = await db.all<Input>(
      sql`with active as (select visitor_id as "visitorId",max(received_at) as "lastSeen",count(distinct session_id) as sessions,count(case when name='pageview' then 1 end) as pageviews from events where ${where} and visitor_id is not null group by visitor_id), history as (select active.*,(select min(h.received_at) from events h where h.site_id=${site.id} and h.visitor_id=active."visitorId") as "firstSeen" from active) select * from history where ${cohort === "new" ? sql`"firstSeen">=${start}` : cohort === "returning" ? sql`"firstSeen"<${start}` : sql`1=1`} and ${goal ? sql`exists(select 1 from events where ${where} and visitor_id=history."visitorId" and ${goalMatch(db, goal)})` : sql`1=1`} and ${cursor.last ? sql`("lastSeen"<${cursor.last[0]} or ("lastSeen"=${cursor.last[0]} and "visitorId">${cursor.last[1]}))` : sql`1=1`} order by "lastSeen" desc,"visitorId" limit ${limit + 1}`,
    );
    return {
      ...page(rows, limit, (row) =>
        cursor.next([row.lastSeen as number, row.visitorId as string]),
      ),
      meta,
    };
  }
  if (
    ["get_revenue_report", "get_revenue_breakdown", "list_payments"].includes(
      op,
    )
  ) {
    await reconcilePaymentAttribution(env, { siteId: site.id });
    const mode = choice(q.mode, ["test", "live"]),
      provider =
        q.provider === undefined
          ? undefined
          : choice(q.provider, ["api", "stripe"]);
    if (q.visitorId !== undefined && !canVisitors)
      throw new ApiError(
        403,
        "insufficient_scope",
        "Visitor filters require visitors:read",
      );
    const rf = {
      ...filters,
      mode,
      page: 0,
      ...(q.visitorId ? { visitorId: str(q, "visitorId") } : {}),
    };
    const base = (a: number, b: number) =>
      sql`${revenueFrom(site.id, rf, a, b)} ${provider ? sql`and p.provider=${provider}` : sql``}`;
    const aggregates = sql`p.currency,count(*) as payments,count(distinct p.visitor_id) as customers,sum(p.amount) as amount,sum(p.refunded_amount) as refunds,sum(p.amount-p.refunded_amount) as net`;
    meta.attributionModel = "per_payment_snapshot";
    meta.attributionLimitation =
      "Per-payment model and lookback; pending records reconcile for at least 72 hours, then freeze. Backfills use retained history only.";
    if (op === "get_revenue_report")
      return {
        data: await compare((a, b) =>
          db.all(
            sql`select ${aggregates} ${base(a, b)} group by p.currency order by p.currency`,
          ),
        ),
        meta,
      };
    if (op === "get_revenue_breakdown") {
      const dimension = choice(q.dimension, [
          "source",
          "campaign",
          "landingPage",
        ]),
        column =
          dimension === "source"
            ? sql`case when events.id is null then null else ${trafficSource} end`
            : dimension === "campaign"
              ? sql`events.utm_campaign`
              : sql`events.path`;
      const data = await compare(async (a, b) => {
        const rows = await db.all<Input>(
          sql`select ${column} as label,${aggregates} ${base(a, b)} group by ${column},p.currency order by net desc,p.currency,coalesce(${column},'') limit ${limit + 1}`,
        );
        return {
          dimension,
          rows: rows.slice(0, limit),
          truncated: rows.length > limit,
        };
      });
      return { data, meta };
    }
    const rows = await db.all<Input>(
      sql`select p.external_id as "externalId",p.provider,p.mode,p.currency,p.amount,p.refunded_amount as "refundedAmount",p.paid_at as "paidAt",p.visitor_id as "visitorId",case when events.id is null then null else ${trafficSource} end as source,events.utm_campaign as campaign,events.path as "landingPage",${attributionColumns} ${base(start, end)} and ${cursor.last ? sql`(p.paid_at<${cursor.last[0]} or (p.paid_at=${cursor.last[0]} and (p.provider>${cursor.last[1]} or (p.provider=${cursor.last[1]} and p.external_id>${cursor.last[2]}))))` : sql`1=1`} order by p.paid_at desc,p.provider,p.external_id limit ${limit + 1}`,
    );
    return {
      ...page(rows.map(redact), limit, (row) =>
        cursor.next([
          row.paidAt as number,
          row.provider as string,
          row.externalId as string,
        ]),
      ),
      meta,
    };
  }
  throw new ApiError(404, "not_found", "Report not found");
}
type SQLGroup = ReturnType<typeof sql>[];
