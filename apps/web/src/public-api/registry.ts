import { outputFor } from "./outputs";
import { z } from "zod";
import { dimensionKeys } from "../lib/report-filters";
import { scopes, type Scope } from "./contracts";

const text = z.string().min(1).max(128),
  date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scalar = z.union([z.string().max(256), z.number().finite(), z.boolean()]);
const pagination = {
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(4096).optional(),
};
const dimensions = Object.fromEntries(
  dimensionKeys.map((key) => [
    key,
    z
      .string()
      .min(1)
      .max(key === "path" ? 2048 : 512)
      .optional(),
  ]),
);
const filters = {
  ...dimensions,
  unknown: z
    .union([z.string().max(256), z.array(z.enum(dimensionKeys)).max(11)])
    .optional(),
};
const period = { from: date, to: date, ...filters };
const report = { ...period, compare: z.literal("previous_period").optional() };
const event = {
  ...period,
  eventName: z.string().max(64).optional(),
  propertyKey: z.string().max(64).optional(),
  propertyValue: scalar.optional(),
};
const definition = {
  name: z.string().min(1).max(120),
  icon: z.string().max(64).optional(),
  eventName: z.string().max(64).optional(),
  path: z.string().max(1024).nullable().optional(),
  conditions: z.record(z.string().max(64), scalar).optional(),
};
const funnel = {
  name: z.string().min(1).max(120),
  icon: z.string().max(64).optional(),
  scope: z.enum(["visitor", "session"]),
  windowHours: z.union([
    z.literal(1),
    z.literal(24),
    z.literal(168),
    z.literal(720),
  ]),
  steps: z
    .array(
      z
        .object({
          kind: z.enum(["page", "event"]),
          value: z.string().max(1024),
          conditions: z.record(z.string().max(64), scalar).optional(),
        })
        .strict(),
    )
    .min(2)
    .max(8),
};
type Shape = Record<string, z.ZodType>;
const partial = (shape: Shape) =>
  Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [key, value.optional()]),
  );
export type Operation = {
  name: string;
  method: string;
  path: string;
  scope?: Scope;
  sessionOnly?: boolean;
  tool: boolean;
  report: boolean;
  description: string;
  schema: z.ZodObject<Shape>;
  aliases?: string[];
};
const operations: Operation[] = [];
function add(
  name: string,
  method: string,
  path: string,
  scope: Scope | undefined,
  shape: Shape,
  description: string,
  options: Partial<
    Pick<Operation, "sessionOnly" | "tool" | "report" | "aliases">
  > = {},
) {
  const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  operations.push({
    name,
    method,
    path,
    scope,
    description,
    tool: true,
    report: false,
    ...options,
    schema: z
      .object({ ...Object.fromEntries(params.map((k) => [k, text])), ...shape })
      .strict(),
  });
}
const S = "/sites/{siteId}";
add(
  "get_access",
  "GET",
  "/me",
  undefined,
  {},
  "Inspect this credential's scopes and website grants.",
);
add(
  "get_capabilities",
  "GET",
  "/capabilities",
  undefined,
  {},
  "Discover supported metrics, filters, limits, and authorization scopes.",
);
add(
  "list_api_keys",
  "GET",
  "/api-keys",
  undefined,
  pagination,
  "List credential metadata; secrets are never returned.",
  { sessionOnly: true, tool: false },
);
add(
  "create_api_key",
  "POST",
  "/api-keys",
  undefined,
  {
    name: text,
    scopes: z.array(z.enum(scopes)).min(1),
    siteIds: z.array(text).max(100),
    allSites: z.boolean(),
    expiresAt: z.number().int(),
  },
  "Create a scoped credential; store the returned token securely.",
  { sessionOnly: true, tool: false },
);
add(
  "revoke_api_key",
  "DELETE",
  "/api-keys/{keyId}",
  undefined,
  {},
  "Revoke a credential immediately.",
  { sessionOnly: true, tool: false },
);
add(
  "list_audit_log",
  "GET",
  "/audit-log",
  "audit:read",
  { ...pagination, siteId: text.optional() },
  "List authorized management audit records without secrets.",
);
add(
  "list_sites",
  "GET",
  "/sites",
  "sites:read",
  { ...pagination, search: text.optional() },
  "Find authorized websites by name.",
);
add(
  "create_site",
  "POST",
  "/sites",
  "sites:create",
  {
    name: text,
    origin: z.string().max(512),
    timezone: z.string().max(100).optional(),
  },
  "Create a website and add it to this credential's site grants.",
);
add(
  "get_site",
  "GET",
  S,
  "sites:read",
  {},
  "Read website details and its revision before editing.",
);
add(
  "update_site",
  "PATCH",
  S,
  "sites:write",
  {
    name: text.optional(),
    origin: z.string().max(512).optional(),
    timezone: z.string().max(100).optional(),
  },
  "Update website name, origin or reporting timezone; preserves history and ID.",
);
add(
  "get_tracking_rules",
  "GET",
  S + "/tracking-rules",
  "settings:read",
  {},
  "Read origin/exclusion/bot rules and revision.",
);
add(
  "update_tracking_rules",
  "PATCH",
  S + "/tracking-rules",
  "settings:write",
  {
    additionalOrigins: z.array(z.string().max(512)).max(50).optional(),
    allowAllDomains: z.boolean().optional(),
    excludedPaths: z.array(z.string().max(512)).max(50).optional(),
    excludedHostnames: z.array(z.string().max(253)).max(50).optional(),
    excludeBots: z.boolean().optional(),
  },
  "Change rules for future collection; does not deploy a tracker or delete history.",
);
add(
  "get_installation",
  "GET",
  S + "/installation",
  "settings:read",
  { mode: z.enum(["full", "anonymous", "paused"]).optional() },
  "Generate a tracking snippet. The website implementer must install it; this does not change a running tracker.",
);
add(
  "get_retention",
  "GET",
  S + "/retention",
  "settings:read",
  {},
  "Read independent event/payment retention policies and revision.",
);
const retention = z.union([
  z.literal(0),
  z.literal(30),
  z.literal(90),
  z.literal(180),
  z.literal(365),
]);
add(
  "update_retention",
  "PATCH",
  S + "/retention",
  "retention:write",
  {
    eventRetentionDays: retention.optional(),
    paymentRetentionDays: retention.optional(),
  },
  "Change retention. Future cleanup deletes expired history permanently; 0 disables expiration.",
);
add(
  "get_ingestion_status",
  "GET",
  S + "/ingestion-status",
  "operations:read",
  {},
  "Inspect available delivery counters and freshness over the last 24 hours.",
);
for (const [name, path, description] of [
  [
    "get_overview",
    "overview",
    "Read headline traffic, browser and session metrics.",
  ],
  [
    "get_audience_report",
    "audience",
    "Read new/returning browsers and session frequency from retained history.",
  ],
  [
    "get_session_report",
    "sessions",
    "Read bounce rate, observed duration in seconds, and top entry/exit pages.",
  ],
] as const)
  add(
    name,
    "GET",
    S + "/reports/" + path,
    "reports:read",
    report,
    description,
    { report: true },
  );
add(
  "get_timeseries",
  "GET",
  S + "/reports/timeseries",
  "reports:read",
  { ...report, metric: z.literal("pageviews").optional() },
  "Read zero-filled daily pageviews; site-local calendar dates are required.",
  { report: true },
);
add(
  "get_breakdown",
  "GET",
  S + "/reports/breakdown",
  "reports:read",
  {
    ...report,
    dimension: z.enum(dimensionKeys),
    metric: z.enum(["pageviews", "visitors"]).optional(),
    limit: pagination.limit,
  },
  "Compare a supported traffic dimension; visitors supports location/technology only. Totals cover all groups.",
  { report: true },
);
add(
  "get_live",
  "GET",
  S + "/live",
  "reports:read",
  filters,
  "Read website-wide online presence (60 seconds) and filtered recent activity (5 minutes). No date range.",
  { report: true },
);
add(
  "list_event_names",
  "GET",
  S + "/event-names",
  "events:read",
  { ...period, ...pagination },
  "Discover retained event names and counts, with pagination.",
  { report: true },
);
add(
  "list_event_properties",
  "GET",
  S + "/event-properties",
  "events:read",
  { ...period, ...pagination, eventName: text.optional() },
  "Discover observed property keys and types. These are data, not declared schemas.",
  { report: true },
);
add(
  "list_event_property_values",
  "GET",
  S + "/event-property-values",
  "events:read",
  { ...period, ...pagination, eventName: text.optional(), propertyKey: text },
  "Discover typed values for an event property, without conflating strings and numbers.",
  { report: true },
);
add(
  "get_event_report",
  "GET",
  S + "/reports/events",
  "reports:read",
  { ...event, limit: pagination.limit },
  "Count events and identified browsers with exact scalar property matching.",
  { report: true },
);
add(
  "list_events",
  "GET",
  S + "/events",
  "events:read",
  { ...event, ...pagination },
  "Inspect retained events and properties; raw identifiers additionally require visitors:read.",
  { report: true },
);
add(
  "get_event",
  "GET",
  S + "/events/{eventId}",
  "events:read",
  {},
  "Read one retained event on this website.",
  { report: true },
);
add(
  "list_visitors",
  "GET",
  S + "/visitors",
  "visitors:read",
  {
    ...period,
    ...pagination,
    cohort: z.enum(["all", "new", "returning"]).optional(),
    goalId: text.optional(),
  },
  "List identified browsers matching activity, cohort and goal filters.",
  { report: true },
);
add(
  "get_visitor",
  "GET",
  S + "/visitors/{visitorId}",
  "visitors:read",
  {},
  "Read a retained browser's activity summary; this is not verified person identity.",
  { report: true },
);
add(
  "get_visitor_journey",
  "GET",
  S + "/visitors/{visitorId}/journey",
  "visitors:read",
  { cursor: pagination.cursor },
  "Inspect session-grouped retained activity in pages of 100; payments require payments:read.",
  { report: true },
);
for (const [kind, shape] of [
  ["goal", definition],
  ["funnel", funnel],
] as const) {
  const plural = kind + "s";
  add(
    "list_" + plural,
    "GET",
    S + "/" + plural,
    `${plural}:read` as Scope,
    { ...pagination, archived: z.enum(["false", "true", "all"]).optional() },
    "List " + kind + " definitions without evaluating reports.",
  );
  add(
    "get_" + kind,
    "GET",
    S + "/" + plural + "/{" + kind + "Id}",
    `${plural}:read` as Scope,
    {},
    "Read a " + kind + " definition and revision.",
  );
  add(
    "create_" + kind,
    "POST",
    S + "/" + plural,
    `${plural}:write` as Scope,
    shape,
    "Create a " + kind + "; exact typed conditions apply to the same event.",
  );
  add(
    "update_" + kind,
    "PATCH",
    S + "/" + plural + "/{" + kind + "Id}",
    `${plural}:write` as Scope,
    { ...partial(shape), archived: z.boolean().optional() },
    "Edit or archive/restore a " +
      kind +
      ". Edits recalculate retained historical results.",
    { aliases: [`set_${kind}_archived`] },
  );
}
add(
  "get_goal_report",
  "GET",
  S + "/reports/goals",
  "reports:read",
  { ...report, goalId: text.optional() },
  "Read goal completions, converted sessions, explicit denominator and conversion rate.",
  { report: true },
);
add(
  "get_funnel_report",
  "GET",
  S + "/funnels/{funnelId}/report",
  "reports:read",
  report,
  "Evaluate one ordered funnel and its drop-off. Do not automatically poll this expensive report.",
  { report: true },
);
add(
  "get_revenue_report",
  "GET",
  S + "/reports/revenue",
  "revenue:read",
  { ...report, mode: z.enum(["test", "live"]) },
  "Read revenue/refunds/net by currency in minor units; never sum currencies. Attribution uses per-payment snapshots with model, lookback, pending/finalized status and unmatched reason.",
  { report: true },
);
add(
  "get_revenue_breakdown",
  "GET",
  S + "/reports/revenue/breakdown",
  "revenue:read",
  {
    ...report,
    mode: z.enum(["test", "live"]),
    dimension: z.enum(["source", "campaign", "landingPage"]),
    limit: pagination.limit,
  },
  "Break down attributed revenue by source, campaign or landing page, retaining currencies.",
  { report: true },
);
add(
  "list_payments",
  "GET",
  S + "/payments",
  "payments:read",
  {
    ...period,
    ...pagination,
    mode: z.enum(["test", "live"]),
    provider: z.enum(["api", "stripe"]).optional(),
    visitorId: text.optional(),
  },
  "Inspect recorded analytics payments; this does not charge or refund customers.",
  { report: true },
);
add(
  "get_payment",
  "GET",
  S + "/payments/{provider}/{mode}/{externalId}",
  "payments:read",
  {
    provider: z.enum(["api", "stripe"]),
    mode: z.enum(["test", "live"]),
    externalId: z.string().min(1).max(256),
  },
  "Read a payment using its provider, mode and external ID.",
  { report: true },
);
add(
  "get_payment_integration",
  "GET",
  S + "/payment-integration",
  "integrations:read",
  {},
  "Read integration status, webhook URLs and revision, never secrets.",
);
add(
  "set_stripe",
  "PUT",
  S + "/payment-integration/stripe/{mode}",
  "integrations:write",
  { mode: z.enum(["test", "live"]), secret: z.string().min(1).max(262) },
  "Configure a Stripe webhook signing secret.",
  { tool: false },
);
add(
  "disconnect_stripe",
  "DELETE",
  S + "/payment-integration/stripe/{mode}",
  "integrations:write",
  { mode: z.enum(["test", "live"]) },
  "Disconnect Stripe ingestion for one mode; future deliveries cannot be verified.",
);
add(
  "rotate_payment_ingestion_key",
  "POST",
  S + "/payment-integration/api-key",
  "integrations:write",
  {},
  "Rotate the payment ingestion key. Existing senders need the returned replacement.",
  { tool: false },
);
add(
  "revoke_payment_ingestion_key",
  "DELETE",
  S + "/payment-integration/api-key",
  "integrations:write",
  {},
  "Revoke payment ingestion; existing senders will stop working.",
);
export { operations };
export function toolSchema(op: Operation, alias?: string) {
  const shape = alias
    ? {
        siteId: text,
        [alias.includes("goal") ? "goalId" : "funnelId"]: text,
        archived: z.boolean(),
      }
    : op.schema.shape;
  return z
    .object({
      ...shape,
      ...(op.method !== "GET" ? { idempotencyKey: text.optional() } : {}),
      ...(["PATCH", "PUT", "DELETE"].includes(op.method) ||
      op.name === "rotate_payment_ingestion_key"
        ? { revision: text }
        : {}),
      ...(/^(create_|rotate_|set_stripe)/.test(op.name)
        ? { idempotencyKey: text }
        : {}),
    })
    .strict();
}
export function openapi(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of operations) {
    const schema = z.toJSONSchema(op.schema);
    const params = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const properties = schema.properties ?? {},
      required = schema.required ?? [];
    const parameters: unknown[] = params.map((name) => ({
      name,
      in: "path",
      required: true,
      schema: properties[name],
    }));
    if (op.method === "GET") {
      for (const [name, value] of Object.entries(properties))
        if (!params.includes(name))
          parameters.push({
            name,
            in: "query",
            required: required.includes(name),
            schema: value,
          });
    } else {
      parameters.push({
        name: "Idempotency-Key",
        in: "header",
        required: /^(create_|rotate_|set_stripe)/.test(op.name),
        schema: { type: "string", maxLength: 128 },
      });
      if (
        (["PATCH", "PUT", "DELETE"].includes(op.method) && !op.sessionOnly) ||
        op.name === "rotate_payment_ingestion_key"
      )
        parameters.push({
          name: "If-Match",
          in: "header",
          required: true,
          schema: { type: "string" },
        });
    }
    const bodyProperties = Object.fromEntries(
      Object.entries(properties).filter(([name]) => !params.includes(name)),
    );
    const route = (paths[op.path] ??= {});
    route[op.method.toLowerCase()] = {
      operationId: op.name,
      description: op.description,
      security: op.sessionOnly ? [{ ownerSession: [] }] : [{ bearerAuth: [] }],
      "x-yaap-scopes": op.scope ? [op.scope] : [],
      parameters,
      ...(op.method !== "GET" && Object.keys(bodyProperties).length
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: bodyProperties,
                    required: required.filter((k) => !params.includes(k)),
                    additionalProperties: false,
                  },
                },
              },
            },
          }
        : {}),
      responses: {
        [op.method === "POST" && op.name.startsWith("create_") ? "201" : "200"]:
          {
            description: "Success",
            content: {
              "application/json": {
                schema: z.toJSONSchema(outputFor(op.name)),
              },
            },
          },
        default: {
          description: "Structured error with code, message and requestId",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["error"],
                properties: {
                  error: {
                    type: "object",
                    required: ["code", "message", "requestId"],
                    properties: {
                      code: { type: "string" },
                      message: { type: "string" },
                      requestId: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "YAAP public API", version: "1.0.0" },
    servers: [{ url: origin + "/api/v1" }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
        ownerSession: {
          type: "apiKey",
          in: "cookie",
          name: "os-analytics.session_token",
        },
      },
    },
  };
}
