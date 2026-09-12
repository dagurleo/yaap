import { z } from "zod";

// Named output contracts are shared by OpenAPI and MCP. Passthrough permits
// additive fields while preserving required fields and their metric units.
const n = z.number(),
  text = z.string(),
  nullableText = text.nullable();
const properties = z.record(text, z.union([text, n, z.boolean()]));
const object = (shape: z.ZodRawShape) => z.object(shape).passthrough();
const compare = (schema: z.ZodType) =>
  object({ current: schema, comparison: schema.nullable() });
const site = object({
  id: text,
  name: text,
  origin: text,
  createdAt: n,
  revision: text,
  timezone: text,
});
const definition = {
  id: text,
  siteId: text,
  name: text,
  icon: text,
  archived: z.boolean(),
  createdAt: n,
  revision: text,
};
const goal = object({
  ...definition,
  eventName: text,
  path: nullableText,
  conditions: properties,
});
const step = object({
  kind: z.enum(["page", "event"]),
  value: text,
  conditions: properties.optional(),
});
const funnel = object({
  ...definition,
  scope: z.enum(["visitor", "session"]),
  windowHours: n,
  steps: z.array(step),
  updatedAt: n,
});
const event = object({
  id: text,
  name: text,
  path: text,
  receivedAt: n,
  properties,
  visitorId: nullableText.optional(),
  sessionId: nullableText.optional(),
});
const payment = object({
  externalId: text,
  provider: z.enum(["api", "stripe"]),
  mode: z.enum(["test", "live"]),
  currency: text,
  amount: n,
  refundedAmount: n,
  paidAt: n,
  visitorId: nullableText.optional(),
  source: nullableText.optional(),
  campaign: nullableText.optional(),
  landingPage: nullableText.optional(),
});
const session = object({
  sessions: n,
  pageviewSessions: n,
  bouncedSessions: n,
  bounceRate: n.nullable(),
  averageDurationSeconds: n.nullable(),
  entryPages: z.array(object({ path: text, sessions: n })),
  exitPages: z.array(object({ path: text, sessions: n })),
});
const money = object({
  currency: text,
  amount: n,
  refunds: n,
  net: n,
  payments: n,
  customers: n,
});
const access = {
  scopes: z.array(text),
  siteIds: z.array(text),
  allSites: z.boolean(),
};
const update = object({
  updated: z.literal(true),
  revision: text,
  token: text.optional(),
  disconnected: z.boolean().optional(),
});
const outputs: Record<string, z.ZodType> = {
  get_access: object({ credentialId: text, kind: text, ...access }),
  get_capabilities: object({
    apiVersion: text,
    metricSemanticsVersion: text,
    timezone: text,
    grantedScopes: z.array(text),
    operations: z.array(text),
    limits: z.record(text, n),
  }),
  list_api_keys: z.array(
    object({
      id: text,
      name: text,
      hint: text,
      ...access,
      expiresAt: n,
      revokedAt: n.nullable(),
      kind: text,
    }),
  ),
  create_api_key: object({
    id: text,
    name: text,
    token: text,
    hint: text,
    ...access,
    createdAt: n,
    expiresAt: n,
  }),
  revoke_api_key: object({ id: text, revoked: z.literal(true) }),
  list_audit_log: z.array(
    object({
      id: text,
      actorId: text,
      siteId: nullableText,
      operation: text,
      resourceId: nullableText,
      fields: z.array(text),
      createdAt: n,
    }),
  ),
  list_sites: z.array(site),
  get_site: site,
  create_site: site,
  update_site: site,
  get_tracking_rules: object({
    additionalOrigins: z.array(text),
    allowAllDomains: z.boolean(),
    excludedPaths: z.array(text),
    excludedHostnames: z.array(text),
    excludeBots: z.boolean(),
    revision: text,
  }),
  get_retention: object({
    eventRetentionDays: n,
    paymentRetentionDays: n,
    lastCleanupAt: n.nullable(),
    revision: text,
  }),
  get_installation: object({
    siteId: text,
    mode: z.enum(["full", "anonymous", "paused"]),
    trackerUrl: text,
    snippet: text,
    eventExample: text,
    paymentEndpoint: text,
    deploymentRequired: z.literal(true),
  }),
  get_ingestion_status: object({
    start: n,
    asOf: n,
    counters: z.record(text, n),
    lastQueuedAt: n.nullable(),
    lastStoredAt: n.nullable(),
    hours: z.array(z.record(text, n)),
  }),
  get_overview: compare(
    object({
      pageviews: n,
      pagesViewed: n,
      identifiedPageviews: n,
      visitors: n,
      sessions: n,
      customEvents: n,
      sessionMetrics: session,
    }),
  ),
  get_session_report: compare(session),
  get_audience_report: compare(
    object({
      visitors: n,
      newVisitors: n,
      returningVisitors: n,
      oneSession: n,
      twoOrThreeSessions: n,
      fourPlusSessions: n,
      sessionsPerVisitor: n.nullable(),
    }),
  ),
  get_timeseries: compare(z.array(object({ date: text, pageviews: n }))),
  get_breakdown: compare(
    object({
      dimension: text,
      metric: text,
      total: n,
      truncated: z.boolean(),
      rows: z.array(
        object({
          value0: nullableText,
          value1: nullableText.optional(),
          value2: nullableText.optional(),
          value: n,
        }),
      ),
    }),
  ),
  get_live: object({
    online: object({ visitors: n, since: n }),
    recent: object({ visitors: n, since: n }),
  }),
  list_event_names: z.array(object({ name: text, events: n })),
  list_event_properties: z.array(
    object({
      key: text,
      type: z.enum(["string", "number", "boolean"]),
      events: n,
    }),
  ),
  list_event_property_values: z.array(
    object({
      value: z.union([text, n, z.boolean()]),
      type: z.enum(["string", "number", "boolean"]),
      events: n,
    }),
  ),
  get_event_report: object({
    events: n,
    visitors: n,
    names: z.array(object({ name: text, events: n })),
    truncated: z.boolean(),
  }),
  list_events: z.array(event),
  get_event: event,
  list_visitors: z.array(
    object({
      visitorId: text,
      firstSeen: n,
      lastSeen: n,
      sessions: n,
      pageviews: n,
    }),
  ),
  get_visitor: object({
    visitorId: text,
    firstSeen: n,
    lastSeen: n,
    sessions: n,
    events: n,
  }),
  get_visitor_journey: object({
    visitorId: text,
    firstSeen: n,
    lastSeen: n,
    sessions: n,
    eventCount: n,
    events: z.array(event),
    payments: z.array(payment).optional(),
  }),
  list_goals: z.array(goal),
  get_goal: goal,
  create_goal: goal,
  update_goal: goal,
  list_funnels: z.array(funnel),
  get_funnel: funnel,
  create_funnel: funnel,
  update_funnel: funnel,
  get_goal_report: compare(
    z.array(
      object({
        id: text,
        name: text,
        completions: n,
        identifiedCompletions: n,
        convertedSessions: n,
        eligibleSessions: n,
        conversionRate: n.nullable(),
      }),
    ),
  ),
  get_funnel_report: object({
    funnelId: text,
    ...compare(
      object({
        entrants: n,
        completed: n,
        conversionRate: n.nullable(),
        steps: z.array(
          object({
            ...step.shape,
            reached: n,
            conversionRate: n.nullable(),
            stepConversionRate: n.nullable(),
            dropOff: n,
            dropOffRate: n.nullable(),
          }),
        ),
      }),
    ).shape,
  }),
  get_revenue_report: compare(z.array(money)),
  get_revenue_breakdown: compare(
    object({
      dimension: text,
      rows: z.array(object({ ...money.shape, label: nullableText })),
      truncated: z.boolean(),
    }),
  ),
  list_payments: z.array(payment),
  get_payment: payment,
  get_payment_integration: object({
    apiKeyHint: nullableText,
    stripeTest: z.boolean(),
    stripeLive: z.boolean(),
    revision: text,
    webhooks: object({ test: text, live: text }),
  }),
  set_stripe: update,
  disconnect_stripe: update,
  rotate_payment_ingestion_key: update,
  revoke_payment_ingestion_key: update,
};
outputs.update_tracking_rules = outputs.get_tracking_rules;
outputs.update_retention = outputs.get_retention;
export function outputFor(operation: string) {
  const data = outputs[operation];
  if (!data) throw new Error(`Missing output contract: ${operation}`);
  return object({
    data,
    meta: object({
      requestId: text,
      apiVersion: text,
      metricSemanticsVersion: text,
      asOf: n,
      revision: text.optional(),
    }),
    pagination: object({ nextCursor: text.nullable() }).optional(),
  });
}
