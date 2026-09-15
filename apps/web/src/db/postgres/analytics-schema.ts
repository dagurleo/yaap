import { sql } from "drizzle-orm";
import {
  defaultTrackingRules,
  type TrackingRules,
} from "../../lib/site-settings";
import type { FunnelStep } from "../../lib/funnels";
import type { EventProperties } from "../../lib/event-properties";
import {
  check,
  foreignKey,
  index,
  uniqueIndex,
  bigint,
  customType,
  primaryKey,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("workspaces_owner_user").on(table.ownerUserId)],
);

const integerBoolean = customType<{ data: boolean; driverData: number }>({
  dataType: () => "integer",
  toDriver: (value) => (value ? 1 : 0),
  fromDriver: (value) => Number(value) === 1,
});
const jsonText = customType<{ data: unknown; driverData: string }>({
  dataType: () => "text",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => JSON.parse(value),
});

export const requestLimits = pgTable(
  "request_limits",
  {
    key: text("key").primaryKey(),
    count: bigint("count", { mode: "number" }).notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (table) => [index("request_limits_expiry").on(table.expiresAt)],
);

export const sites = pgTable(
  "sites",
  {
    timezone: text("timezone").notNull().default("UTC"),
    revision: text("revision").notNull().default("initial"),
    trackingRules: jsonText("tracking_rules")
      .$type<TrackingRules>()
      .notNull()
      .default(
        sql.raw(
          "'" +
            JSON.stringify(defaultTrackingRules).replaceAll("'", "''") +
            "'",
        ),
      ),
    eventRetentionDays: bigint("event_retention_days", { mode: "number" })
      .notNull()
      .default(0),
    paymentRetentionDays: bigint("payment_retention_days", { mode: "number" })
      .notNull()
      .default(0),
    excludeBots: integerBoolean("exclude_bots")
      .notNull()
      .default(sql`1`),
    lastCleanupAt: bigint("last_cleanup_at", { mode: "number" }),
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    origin: text("origin").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("sites_workspace").on(table.workspaceId)],
);

export const siteMemberships = pgTable(
  "site_memberships",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["viewer"] })
      .notNull()
      .default("viewer"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.userId] }),
    index("site_memberships_user").on(table.userId),
    check("site_memberships_viewer", sql`${table.role} = 'viewer'`),
  ],
);

export const siteInvitations = pgTable(
  "site_invitations",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    emailNormalized: text("email_normalized").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    acceptedAt: bigint("accepted_at", { mode: "number" }),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: bigint("revoked_at", { mode: "number" }),
    lastSentAt: bigint("last_sent_at", { mode: "number" }),
    sendStatus: text("send_status", {
      enum: ["pending", "sent", "failed", "unknown"],
    })
      .notNull()
      .default("pending"),
    providerMessageId: text("provider_message_id"),
  },
  (table) => [
    uniqueIndex("site_invitations_token").on(table.tokenHash),
    uniqueIndex("site_invitations_pending")
      .on(table.siteId, table.emailNormalized)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    index("site_invitations_site").on(table.siteId),
  ],
);

export const billingAccounts = pgTable(
  "billing_accounts",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id),
    environment: text("environment", {
      enum: ["sandbox", "production"],
    }).notNull(),
    polarCustomerId: text("polar_customer_id"),
    trialStartsAt: bigint("trial_starts_at", { mode: "number" }),
    trialEndsAt: bigint("trial_ends_at", { mode: "number" }),
    recoveryEndsAt: bigint("recovery_ends_at", { mode: "number" }),
    lifecyclePolicyVersion: bigint("lifecycle_policy_version", {
      mode: "number",
    })
      .notNull()
      .default(1),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("billing_accounts_customer")
      .on(table.environment, table.polarCustomerId)
      .where(sql`${table.polarCustomerId} is not null`),
    check(
      "billing_accounts_trial",
      sql`(${table.trialStartsAt} is null and ${table.trialEndsAt} is null) or (${table.trialStartsAt} < ${table.trialEndsAt})`,
    ),
  ],
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    environment: text("environment", {
      enum: ["sandbox", "production"],
    }).notNull(),
    polarSubscriptionId: text("polar_subscription_id").notNull(),
    polarProductId: text("polar_product_id").notNull(),
    planKey: text("plan_key").notNull(),
    planVersion: bigint("plan_version", { mode: "number" }).notNull(),
    providerStatus: text("provider_status", {
      enum: ["active", "past_due", "canceled", "revoked", "incomplete"],
    }).notNull(),
    startedAt: bigint("started_at", { mode: "number" }).notNull(),
    currentPeriodStartsAt: bigint("current_period_starts_at", {
      mode: "number",
    }).notNull(),
    currentPeriodEndsAt: bigint("current_period_ends_at", {
      mode: "number",
    }).notNull(),
    paidThroughAt: bigint("paid_through_at", { mode: "number" }).notNull(),
    paymentGraceEndsAt: bigint("payment_grace_ends_at", { mode: "number" }),
    cancelAtPeriodEnd: integerBoolean("cancel_at_period_end")
      .notNull()
      .default(sql`0`),
    pendingPlanKey: text("pending_plan_key"),
    pendingPlanVersion: bigint("pending_plan_version", { mode: "number" }),
    pendingPlanEffectiveAt: bigint("pending_plan_effective_at", {
      mode: "number",
    }),
    providerRevision: text("provider_revision").notNull(),
    lastReconciledAt: bigint("last_reconciled_at", {
      mode: "number",
    }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("billing_subscriptions_provider").on(
      table.environment,
      table.polarSubscriptionId,
    ),
    uniqueIndex("billing_subscriptions_open")
      .on(table.workspaceId, table.environment)
      .where(sql`${table.providerStatus} not in ('canceled','revoked')`),
    index("billing_subscriptions_workspace").on(table.workspaceId),
    check(
      "billing_subscriptions_period",
      sql`${table.currentPeriodStartsAt} < ${table.currentPeriodEndsAt}`,
    ),
  ],
);

export const billingUsagePeriods = pgTable(
  "billing_usage_periods",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    source: text("source", { enum: ["trial", "subscription"] }).notNull(),
    sourceId: text("source_id").notNull(),
    planKey: text("plan_key"),
    planVersion: bigint("plan_version", { mode: "number" }).notNull(),
    startsAt: bigint("starts_at", { mode: "number" }).notNull(),
    endsAt: bigint("ends_at", { mode: "number" }).notNull(),
    allowance: bigint("allowance", { mode: "number" }).notNull(),
    admissionCeiling: bigint("admission_ceiling", { mode: "number" }).notNull(),
    persistedCount: bigint("persisted_count", { mode: "number" })
      .notNull()
      .default(0),
    reservedCount: bigint("reserved_count", { mode: "number" })
      .notNull()
      .default(0),
    notified80At: bigint("notified_80_at", { mode: "number" }),
    notified100At: bigint("notified_100_at", { mode: "number" }),
    notifiedCeilingAt: bigint("notified_ceiling_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("billing_usage_periods_source").on(
      table.workspaceId,
      table.source,
      table.sourceId,
      table.startsAt,
      table.endsAt,
    ),
    index("billing_usage_periods_workspace_time").on(
      table.workspaceId,
      table.startsAt,
      table.endsAt,
    ),
    check(
      "billing_usage_periods_range",
      sql`${table.startsAt} < ${table.endsAt}`,
    ),
    check(
      "billing_usage_periods_counts",
      sql`${table.allowance} > 0 and ${table.admissionCeiling} >= ${table.allowance} and ${table.persistedCount} >= 0 and ${table.reservedCount} >= 0 and ${table.persistedCount} + ${table.reservedCount} <= ${table.admissionCeiling}`,
    ),
  ],
);

export const billingUsageSites = pgTable(
  "billing_usage_sites",
  {
    periodId: text("period_id")
      .notNull()
      .references(() => billingUsagePeriods.id),
    siteId: text("site_id").notNull(),
    siteLabel: text("site_label").notNull(),
    persistedCount: bigint("persisted_count", { mode: "number" })
      .notNull()
      .default(0),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.periodId, table.siteId] }),
    check("billing_usage_sites_count", sql`${table.persistedCount} >= 0`),
  ],
);

export const billingEventReceipts = pgTable(
  "billing_event_receipts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    siteId: text("site_id").notNull(),
    siteLabel: text("site_label").notNull(),
    eventId: text("event_id").notNull(),
    periodId: text("period_id")
      .notNull()
      .references(() => billingUsagePeriods.id),
    ingressedAt: bigint("ingressed_at", { mode: "number" }).notNull(),
    state: text("state", {
      enum: ["reserved", "persisted", "released", "rejected", "expired"],
    })
      .notNull()
      .default("reserved"),
    payload: text("payload").notNull(),
    publishState: text("publish_state", {
      enum: ["pending", "published", "unknown", "abandoned"],
    })
      .notNull()
      .default("pending"),
    publishAttempts: bigint("publish_attempts", { mode: "number" })
      .notNull()
      .default(0),
    nextPublishAt: bigint("next_publish_at", { mode: "number" }).notNull(),
    lastPublishAt: bigint("last_publish_at", { mode: "number" }),
    persistedAt: bigint("persisted_at", { mode: "number" }),
    terminalReason: text("terminal_reason"),
    replayUntil: bigint("replay_until", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("billing_event_receipts_event").on(
      table.workspaceId,
      table.siteId,
      table.eventId,
    ),
    index("billing_event_receipts_publish").on(
      table.publishState,
      table.nextPublishAt,
    ),
    index("billing_event_receipts_expiry").on(table.replayUntil),
  ],
);

export const billingOperations = pgTable(
  "billing_operations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    operationKey: text("operation_key").notNull(),
    kind: text("kind", {
      enum: ["checkout", "upgrade", "downgrade"],
    }).notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    expectedSubscriptionRevision: text("expected_subscription_revision"),
    selectedPlanKey: text("selected_plan_key").notNull(),
    selectedPlanVersion: bigint("selected_plan_version", {
      mode: "number",
    }).notNull(),
    state: text("state", {
      enum: ["pending", "unknown", "complete", "failed"],
    })
      .notNull()
      .default("pending"),
    providerCheckoutId: text("provider_checkout_id"),
    providerReference: text("provider_reference"),
    boundedError: text("bounded_error"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("billing_operations_key").on(
      table.workspaceId,
      table.operationKey,
    ),
    uniqueIndex("billing_operations_open_checkout")
      .on(table.workspaceId)
      .where(
        sql`${table.kind}='checkout' and ${table.state} in ('pending','unknown')`,
      ),
    uniqueIndex("billing_operations_open_change")
      .on(table.workspaceId)
      .where(
        sql`${table.kind} in ('upgrade','downgrade') and ${table.state} in ('pending','unknown')`,
      ),
    uniqueIndex("billing_operations_provider_checkout")
      .on(table.providerCheckoutId)
      .where(
        sql`${table.providerCheckoutId} is not null and ${table.state} in ('pending','unknown')`,
      ),
    index("billing_operations_pending").on(table.state, table.updatedAt),
  ],
);

export const billingWebhookReceipts = pgTable(
  "billing_webhook_receipts",
  {
    environment: text("environment", {
      enum: ["sandbox", "production"],
    }).notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    subjectId: text("subject_id"),
    receivedAt: bigint("received_at", { mode: "number" }).notNull(),
    state: text("state", {
      enum: ["pending", "processing", "complete", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
    retryAt: bigint("retry_at", { mode: "number" }).notNull(),
    boundedError: text("bounded_error"),
    completedAt: bigint("completed_at", { mode: "number" }),
  },
  (table) => [
    primaryKey({ columns: [table.environment, table.eventId] }),
    index("billing_webhook_receipts_retry").on(table.state, table.retryAt),
  ],
);

export const billingNotificationJobs = pgTable(
  "billing_notification_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    periodId: text("period_id").references(() => billingUsagePeriods.id),
    kind: text("kind").notNull(),
    entitlementRevision: text("entitlement_revision").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    state: text("state", {
      enum: ["pending", "processing", "sent", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
    nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull(),
    providerMessageId: text("provider_message_id"),
    boundedError: text("bounded_error"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("billing_notification_jobs_dedupe").on(table.dedupeKey),
    index("billing_notification_jobs_pending").on(
      table.state,
      table.nextAttemptAt,
    ),
  ],
);

export const events = pgTable(
  "events",
  {
    properties: jsonText("properties")
      .$type<EventProperties>()
      .notNull()
      .default(sql`'{}'`),
    id: text("id").notNull(),
    billingReceiptId: text("billing_receipt_id"),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    name: text("name").notNull(),
    path: text("path").notNull(),
    receivedAt: bigint("received_at", { mode: "number" }).notNull(),
    visitorId: text("visitor_id"),
    sessionId: text("session_id"),
    trackingVersion: bigint("tracking_version", { mode: "number" })
      .notNull()
      .default(1),
    referrerHost: text("referrer_host"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    adProvider: text("ad_provider"),
    adAccountId: text("ad_account_id"),
    adCampaignId: text("ad_campaign_id"),
    adGroupId: text("ad_group_id"),
    adId: text("ad_id"),
    adTouchId: text("ad_touch_id"),
    adTouchedAt: bigint("ad_touched_at", { mode: "number" }),
    adConsentPolicy: text("ad_consent_policy"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    browser: text("browser"),
    os: text("os"),
    device: text("device"),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.id] }),
    index("events_site_time").on(table.siteId, table.receivedAt),
    uniqueIndex("events_billing_receipt")
      .on(table.billingReceiptId)
      .where(sql`${table.billingReceiptId} is not null`),
    index("events_site_visitor_session_time").on(
      table.siteId,
      table.visitorId,
      table.sessionId,
      table.receivedAt,
    ),
    index("events_site_visitor_time").on(
      table.siteId,
      table.visitorId,
      table.receivedAt,
    ),
  ],
);

export const goals = pgTable(
  "goals",
  {
    revision: text("revision").notNull().default("initial"),
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    name: text("name").notNull(),
    eventName: text("event_name").notNull(),
    path: text("path"),
    conditions: jsonText("conditions")
      .$type<EventProperties>()
      .notNull()
      .default(sql`'{}'`),
    definitionKey: text("definition_key"),
    icon: text("icon").notNull().default("target"),
    archived: integerBoolean("archived")
      .notNull()
      .default(sql`0`),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("goals_site_definition").on(
      table.siteId,
      sql`coalesce(${table.definitionKey}, ${table.eventName})`,
    ),
  ],
);

export const funnels = pgTable(
  "funnels",
  {
    revision: text("revision").notNull().default("initial"),
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("route"),
    scope: text("scope", { enum: ["visitor", "session"] }).notNull(),
    windowHours: bigint("window_hours", { mode: "number" }).notNull(),
    steps: jsonText("steps").$type<FunnelStep[]>().notNull(),
    archived: integerBoolean("archived")
      .notNull()
      .default(sql`0`),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("funnels_site").on(table.siteId)],
);

export const paymentIntegrations = pgTable("payment_integrations", {
  revision: text("revision").notNull().default("initial"),
  siteId: text("site_id")
    .primaryKey()
    .references(() => sites.id),
  apiKeyHash: text("api_key_hash"),
  apiKeyHint: text("api_key_hint"),
  stripeTestSecret: text("stripe_test_secret"),
  stripeLiveSecret: text("stripe_live_secret"),
  polarTestSecret: text("polar_test_secret"),
  polarLiveSecret: text("polar_live_secret"),
  attributionModel: text("attribution_model", {
    enum: ["first_touch", "last_non_direct"],
  })
    .notNull()
    .default("first_touch"),
  attributionLookbackDays: bigint("attribution_lookback_days", {
    mode: "number",
  })
    .notNull()
    .default(30),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const payments = pgTable(
  "payments",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    provider: text("provider", { enum: ["api", "stripe", "polar"] }).notNull(),
    mode: text("mode", { enum: ["test", "live"] }).notNull(),
    externalId: text("external_id").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    refundedAmount: bigint("refunded_amount", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency").notNull(),
    paidAt: bigint("paid_at", { mode: "number" }).notNull(),
    visitorId: text("visitor_id"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.siteId, table.provider, table.mode, table.externalId],
    }),
    index("payments_site_time").on(table.siteId, table.mode, table.paidAt),
    index("payments_site_visitor_time").on(
      table.siteId,
      table.visitorId,
      table.paidAt,
    ),
  ],
);

export const ingestionBuckets = pgTable(
  "ingestion_buckets",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    hour: bigint("hour", { mode: "number" }).notNull(),
    queued: bigint("queued", { mode: "number" }).notNull().default(0),
    stored: bigint("stored", { mode: "number" }).notNull().default(0),
    duplicates: bigint("duplicates", { mode: "number" }).notNull().default(0),
    bots: bigint("bots", { mode: "number" }).notNull().default(0),
    enqueueFailures: bigint("enqueue_failures", { mode: "number" })
      .notNull()
      .default(0),
    writeFailures: bigint("write_failures", { mode: "number" })
      .notNull()
      .default(0),
    expired: bigint("expired", { mode: "number" }).notNull().default(0),
    lastQueuedAt: bigint("last_queued_at", { mode: "number" }),
    lastStoredAt: bigint("last_stored_at", { mode: "number" }),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.hour] }),
    index("ingestion_buckets_hour").on(table.hour),
  ],
);

export const rollupDays = pgTable(
  "rollup_days",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    day: bigint("day", { mode: "number" }).notNull(),
    completedAt: bigint("completed_at", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.day] })],
);

export const dailyTraffic = pgTable(
  "daily_traffic",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    day: bigint("day", { mode: "number" }).notNull(),
    dimension: text("dimension").notNull(),
    key: text("key").notNull(),
    pageviews: bigint("pageviews", { mode: "number" }).notNull(),
    identified: bigint("identified", { mode: "number" }).notNull(),
  },
  (table) => [
    // Rebuilds replace the entire day atomically under the site lock.
    // Paths can exceed PostgreSQL's btree entry limit; keep them out of indexes.
    index("daily_traffic_lookup").on(table.siteId, table.dimension, table.day),
  ],
);

export const rollupPending = pgTable(
  "rollup_pending",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    day: bigint("day", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.day] }),
    index("rollup_pending_day").on(table.day),
  ],
);

export const dailyActivity = pgTable(
  "daily_activity",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    day: bigint("day", { mode: "number" }).notNull(),
    key: text("key").notNull(),
    visitorId: text("visitor_id"),
    sessionId: text("session_id"),
    name: text("name").notNull(),
    events: bigint("events", { mode: "number" }).notNull(),
    firstAt: bigint("first_at", { mode: "number" }).notNull(),
    lastAt: bigint("last_at", { mode: "number" }).notNull(),
    firstId: text("first_id").notNull(),
    lastId: text("last_id").notNull(),
    firstPath: text("first_path").notNull(),
    lastPath: text("last_path").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.day, table.key] }),
    index("daily_activity_session").on(
      table.siteId,
      table.visitorId,
      table.sessionId,
      table.day,
    ),
  ],
);

export const visitorFirstSeen = pgTable(
  "visitor_first_seen",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    visitorId: text("visitor_id").notNull(),
    firstAt: bigint("first_at", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.visitorId] })],
);

export const sessionSummaries = pgTable(
  "session_summaries",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    visitorId: text("visitor_id").notNull(),
    sessionId: text("session_id").notNull(),
    started: bigint("started", { mode: "number" }).notNull(),
    ended: bigint("ended", { mode: "number" }).notNull(),
    views: bigint("views", { mode: "number" }).notNull(),
    customEvents: bigint("custom_events", { mode: "number" }).notNull(),
    entryPath: text("entry_path"),
    exitPath: text("exit_path"),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.visitorId, table.sessionId] }),
  ],
);

// Ephemeral presence, separate from report events and rollups.
export const visitorPresence = pgTable(
  "visitor_presence",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    visitorId: text("visitor_id").notNull(),
    sessionId: text("session_id").notNull(),
    path: text("path").notNull(),
    receivedAt: bigint("received_at", { mode: "number" }).notNull(),
    country: text("country"),
    source: text("source").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.visitorId] }),
    index("visitor_presence_site_time").on(table.siteId, table.receivedAt),
    index("visitor_presence_expiry").on(table.receivedAt),
  ],
);

// Exact pageview membership: range uniques are deduplicated, never summed.
export const dailyVisitorDimensions = pgTable(
  "daily_visitor_dimensions",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    day: bigint("day", { mode: "number" }).notNull(),
    visitorId: text("visitor_id").notNull(),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    browser: text("browser"),
    os: text("os"),
    device: text("device"),
  },
  (table) => [
    index("daily_visitor_dimensions_lookup").on(table.siteId, table.day),
  ],
);

export const apiCredentials = pgTable(
  "api_credentials",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    hint: text("hint").notNull(),
    scopes: text("scopes").notNull(),
    siteIds: text("site_ids").notNull(),
    allSites: bigint("all_sites", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    revokedAt: bigint("revoked_at", { mode: "number" }),
    kind: text("kind").notNull(),
    clientId: text("client_id"),
    audience: text("audience"),
    refreshHash: text("refresh_hash"),
    refreshExpiresAt: bigint("refresh_expires_at", { mode: "number" }),
  },
  (t) => [
    uniqueIndex("api_credentials_token").on(t.tokenHash),
    index("api_credentials_owner").on(t.ownerId),
    uniqueIndex("api_credentials_refresh").on(t.refreshHash),
  ],
);

export const apiAudit = pgTable(
  "api_audit",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    actorId: text("actor_id").notNull(),
    siteId: text("site_id"),
    operation: text("operation").notNull(),
    resourceId: text("resource_id"),
    fields: text("fields").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("api_audit_owner_time").on(t.ownerId, t.createdAt, t.id)],
);

export const apiIdempotency = pgTable(
  "api_idempotency",
  {
    id: text("id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    response: text("response").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (t) => [index("api_idempotency_expiry").on(t.expiresAt)],
);

export const apiWriteGuards = pgTable(
  "api_write_guards",
  {
    id: text("id").primaryKey(),
    valid: bigint("valid", { mode: "number" }).notNull(),
  },
  (t) => [check("api_write_valid", sql`${t.valid} = 1`)],
);

export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const oauthCodes = pgTable("oauth_codes", {
  hash: text("hash").primaryKey(),
  ownerId: text("owner_id").notNull(),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  challenge: text("challenge").notNull(),
  scopes: text("scopes").notNull(),
  siteIds: text("site_ids").notNull(),
  allSites: bigint("all_sites", { mode: "number" }).notNull(),
  resource: text("resource").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  usedBy: text("used_by"),
});

export const oauthRefreshUsed = pgTable("oauth_refresh_used", {
  hash: text("hash").primaryKey(),
  credentialId: text("credential_id").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

export const paymentAttributions = pgTable(
  "payment_attributions",
  {
    siteId: text("site_id").notNull(),
    provider: text("provider").notNull(),
    mode: text("mode").notNull(),
    externalId: text("external_id").notNull(),
    model: text("model").notNull(),
    visitorId: text("visitor_id"),
    id: text("id"),
    path: text("path"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    adProvider: text("ad_provider"),
    adAccountId: text("ad_account_id"),
    adCampaignId: text("ad_campaign_id"),
    adGroupId: text("ad_group_id"),
    adId: text("ad_id"),
    adTouchId: text("ad_touch_id"),
    adTouchedAt: bigint("ad_touched_at", { mode: "number" }),
    adConsentPolicy: text("ad_consent_policy"),
    referrerHost: text("referrer_host"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    browser: text("browser"),
    os: text("os"),
    device: text("device"),
    lookbackDays: bigint("lookback_days", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    checkedAt: bigint("checked_at", { mode: "number" }).notNull(),
    finalizeAfter: bigint("finalize_after", { mode: "number" }).notNull(),
    finalizedAt: bigint("finalized_at", { mode: "number" }),
    receivedAt: bigint("received_at", { mode: "number" }),
    trackingVersion: bigint("tracking_version", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.provider, t.mode, t.externalId] }),
    foreignKey({
      columns: [t.siteId, t.provider, t.mode, t.externalId],
      foreignColumns: [
        payments.siteId,
        payments.provider,
        payments.mode,
        payments.externalId,
      ],
    }).onDelete("cascade"),
    index("payment_attributions_pending").on(t.finalizedAt, t.checkedAt),
    index("payment_attributions_site_pending").on(
      t.siteId,
      t.finalizedAt,
      t.checkedAt,
    ),
    check(
      "payment_attributions_model",
      sql`${t.model} in ('first_touch','last_non_direct')`,
    ),
    check(
      "payment_attributions_lookback",
      sql`${t.lookbackDays} between 1 and 365`,
    ),
  ],
);

export const sitePublicShares = pgTable("site_public_shares", {
  siteId: text("site_id")
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  publicId: text("public_id").notNull().unique(),
  enabled: integerBoolean("enabled")
    .notNull()
    .default(sql`0`),
  events: integerBoolean("events")
    .notNull()
    .default(sql`0`),
  visitors: integerBoolean("visitors")
    .notNull()
    .default(sql`0`),
  revenue: integerBoolean("revenue")
    .notNull()
    .default(sql`0`),
  conversions: integerBoolean("conversions")
    .notNull()
    .default(sql`0`),
});
