import { sql } from "drizzle-orm";
import { createDb } from "../db";
import { scopes, ApiError, type Result } from "./contracts";
import { requireScope, requireSite, rateLimit } from "./auth";
import { management } from "./management";
import { reports } from "./reports";
import { operations, type Operation } from "./registry";
import type { MutationContext } from "./mutations";

export async function execute(
  op: Operation,
  ctx: MutationContext,
  origin: string,
): Promise<Result> {
  const p = ctx.principal;
  if (op.sessionOnly && p.kind !== "session")
    throw new ApiError(
      403,
      "owner_session_required",
      "Credential administration requires an owner session",
    );
  if (op.scope) requireScope(p, op.scope);
  const parsed = op.schema.safeParse(ctx.input);
  if (!parsed.success)
    throw new ApiError(
      400,
      "invalid_argument",
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; ")
        .slice(0, 1000),
    );
  ctx = {
    ...ctx,
    input: parsed.data,
    siteId:
      typeof parsed.data.siteId === "string" ? parsed.data.siteId : undefined,
  };
  if (ctx.siteId) requireSite(p, ctx.siteId);
  if (
    op.method === "PATCH" &&
    Object.keys(ctx.input).every((k) =>
      ["siteId", "goalId", "funnelId"].includes(k),
    )
  )
    throw new ApiError(
      400,
      "invalid_argument",
      "Supply at least one field to update",
    );
  await rateLimit(ctx.env, p, op.report, ctx.siteId);
  if (op.name === "get_access")
    return {
      data: {
        credentialId: p.id,
        kind: p.kind,
        scopes: p.scopes,
        siteIds: p.siteIds,
        allSites: p.allSites,
      },
    };
  if (op.name === "get_capabilities")
    return {
      data: {
        apiVersion: "1",
        metricSemanticsVersion: "1",
        timezone: "site",
        scopes,
        grantedScopes: p.scopes,
        operations: operations
          .filter(
            (o) => !o.sessionOnly && (!o.scope || p.scopes.includes(o.scope)),
          )
          .map((o) => o.name),
        limits: {
          maxDateRangeDays: 366,
          maxPageSize: 100,
          journeyPageSize: 100,
          cursorTtlSeconds: 86400,
          idempotencyTtlSeconds: 86400,
          requestsPerMinute: 120,
          reportRequestsPerMinute: 30,
          concurrentRequests: 4,
        },
        metrics: {
          rates: "fraction_0_to_1_or_null",
          duration: "seconds",
          money: "integer_minor_units_by_currency",
          visitors: "identified_browsers",
          timeseries: ["pageviews"],
          breakdown: {
            pageviews: [
              "path",
              "source",
              "referrer",
              "campaign",
              "country",
              "region",
              "city",
              "browser",
              "os",
              "device",
            ],
            visitors: ["country", "region", "city", "browser", "os", "device"],
          },
        },
        filters: {
          dimensions: "AND exact match",
          unknown: "comma-separated dimension names or MCP array",
          propertyValue: "JSON scalar in REST query; native scalar in MCP",
          comparison: "previous_period",
          dates: "inclusive calendar dates in the site reporting timezone",
        },
        attribution: "per_payment_snapshot",
        mcp: {
          protocolVersion: "2025-11-25",
          transport: "streamable_http",
          authentication: ["bearer", "oauth_authorization_code_pkce"],
          clientRegistration: "owner_preregistered",
        },
      },
    };
  const db = createDb(ctx.env),
    key = `public:active:${p.id}:${Math.floor(Date.now() / 60000)}`;
  const count = await db.incrementRateLimit(key, Date.now() + 120000);
  try {
    if (count > 4)
      throw new ApiError(
        429,
        "concurrency_limit",
        "Too many concurrent requests; retry shortly",
      );
    return await (op.report ? reports(ctx) : management(ctx, origin));
  } finally {
    await db.run(
      sql`update request_limits set count=count-1 where key=${key} and count>0`,
    );
  }
}
export function envelope(result: Result, requestId: string) {
  return {
    data: result.data,
    meta: {
      requestId,
      apiVersion: "1",
      metricSemanticsVersion: "1",
      asOf: Date.now(),
      ...result.meta,
      ...(result.etag ? { revision: result.etag } : {}),
    },
    ...(result.pagination ? { pagination: result.pagination } : {}),
  };
}
