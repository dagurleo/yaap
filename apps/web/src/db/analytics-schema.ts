import { sql } from "drizzle-orm";
import { defaultTrackingRules, type TrackingRules } from "../lib/site-settings";
import type { FunnelStep } from "../lib/funnels";
import type { EventProperties } from "../lib/event-properties";
import {
  check,
  foreignKey,
  index,
  uniqueIndex,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("workspaces_owner_user").on(table.ownerUserId)],
);

export const requestLimits = sqliteTable(
  "request_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("request_limits_expiry").on(table.expiresAt)],
);

export const sites = sqliteTable(
  "sites",
  {
    timezone: text("timezone").notNull().default("UTC"),
    revision: text("revision").notNull().default("initial"),
    trackingRules: text("tracking_rules", { mode: "json" })
      .$type<TrackingRules>()
      .notNull()
      .default(defaultTrackingRules),
    eventRetentionDays: integer("event_retention_days").notNull().default(0),
    paymentRetentionDays: integer("payment_retention_days")
      .notNull()
      .default(0),
    excludeBots: integer("exclude_bots", { mode: "boolean" })
      .notNull()
      .default(true),
    lastCleanupAt: integer("last_cleanup_at"),
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    origin: text("origin").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("sites_workspace").on(table.workspaceId)],
);

export const siteMemberships = sqliteTable(
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
    createdAt: integer("created_at").notNull(),
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

export const siteInvitations = sqliteTable(
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
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    acceptedAt: integer("accepted_at"),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: integer("revoked_at"),
    lastSentAt: integer("last_sent_at"),
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

export const billingAccounts = sqliteTable(
  "billing_accounts",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id),
    environment: text("environment", {
      enum: ["sandbox", "production"],
    }).notNull(),
    polarCustomerId: text("polar_customer_id"),
    trialStartsAt: integer("trial_starts_at"),
    trialEndsAt: integer("trial_ends_at"),
    recoveryEndsAt: integer("recovery_ends_at"),
    lifecyclePolicyVersion: integer("lifecycle_policy_version")
      .notNull()
      .default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
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

export const billingSubscriptions = sqliteTable(
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
    planVersion: integer("plan_version").notNull(),
    providerStatus: text("provider_status", {
      enum: ["active", "past_due", "canceled", "revoked", "incomplete"],
    }).notNull(),
    startedAt: integer("started_at").notNull(),
    currentPeriodStartsAt: integer("current_period_starts_at").notNull(),
    currentPeriodEndsAt: integer("current_period_ends_at").notNull(),
    paidThroughAt: integer("paid_through_at").notNull(),
    paymentGraceEndsAt: integer("payment_grace_ends_at"),
    cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
      .notNull()
      .default(false),
    pendingPlanKey: text("pending_plan_key"),
    pendingPlanVersion: integer("pending_plan_version"),
    pendingPlanEffectiveAt: integer("pending_plan_effective_at"),
    providerRevision: text("provider_revision").notNull(),
    lastReconciledAt: integer("last_reconciled_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
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

export const billingUsagePeriods = sqliteTable(
  "billing_usage_periods",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    source: text("source", { enum: ["trial", "subscription"] }).notNull(),
    sourceId: text("source_id").notNull(),
    planKey: text("plan_key"),
    planVersion: integer("plan_version").notNull(),
    startsAt: integer("starts_at").notNull(),
    endsAt: integer("ends_at").notNull(),
    allowance: integer("allowance").notNull(),
    admissionCeiling: integer("admission_ceiling").notNull(),
    persistedCount: integer("persisted_count").notNull().default(0),
    reservedCount: integer("reserved_count").notNull().default(0),
    notified80At: integer("notified_80_at"),
    notified100At: integer("notified_100_at"),
    notifiedCeilingAt: integer("notified_ceiling_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
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

export const billingUsageSites = sqliteTable(
  "billing_usage_sites",
  {
    periodId: text("period_id")
      .notNull()
      .references(() => billingUsagePeriods.id),
    siteId: text("site_id").notNull(),
    siteLabel: text("site_label").notNull(),
    persistedCount: integer("persisted_count").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.periodId, table.siteId] }),
    check("billing_usage_sites_count", sql`${table.persistedCount} >= 0`),
  ],
);

export const billingEventReceipts = sqliteTable(
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
    ingressedAt: integer("ingressed_at").notNull(),
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
    publishAttempts: integer("publish_attempts").notNull().default(0),
    nextPublishAt: integer("next_publish_at").notNull(),
    lastPublishAt: integer("last_publish_at"),
    persistedAt: integer("persisted_at"),
    terminalReason: text("terminal_reason"),
    replayUntil: integer("replay_until").notNull(),
    updatedAt: integer("updated_at").notNull(),
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

export const billingOperations = sqliteTable(
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
    selectedPlanVersion: integer("selected_plan_version").notNull(),
    state: text("state", {
      enum: ["pending", "unknown", "complete", "failed"],
    })
      .notNull()
      .default("pending"),
    providerCheckoutId: text("provider_checkout_id"),
    providerReference: text("provider_reference"),
    boundedError: text("bounded_error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
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

export const billingWebhookReceipts = sqliteTable(
  "billing_webhook_receipts",
  {
    environment: text("environment", {
      enum: ["sandbox", "production"],
    }).notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    subjectId: text("subject_id"),
    receivedAt: integer("received_at").notNull(),
    state: text("state", {
      enum: ["pending", "processing", "complete", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    retryAt: integer("retry_at").notNull(),
    boundedError: text("bounded_error"),
    completedAt: integer("completed_at"),
  },
  (table) => [
    primaryKey({ columns: [table.environment, table.eventId] }),
    index("billing_webhook_receipts_retry").on(table.state, table.retryAt),
  ],
);

export const billingNotificationJobs = sqliteTable(
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
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    providerMessageId: text("provider_message_id"),
    boundedError: text("bounded_error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("billing_notification_jobs_dedupe").on(table.dedupeKey),
    index("billing_notification_jobs_pending").on(
      table.state,
      table.nextAttemptAt,
    ),
  ],
);

export const events = sqliteTable(
  "events",
  {
    properties: text("properties", { mode: "json" })
      .$type<EventProperties>()
      .notNull()
      .default({}),
    id: text("id").notNull(),
    billingReceiptId: text("billing_receipt_id"),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    name: text("name").notNull(),
    path: text("path").notNull(),
    receivedAt: integer("received_at").notNull(),
    visitorId: text("visitor_id"),
    sessionId: text("session_id"),
    trackingVersion: integer("tracking_version").notNull().default(1),
    referrerHost: text("referrer_host"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
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

export const goals = sqliteTable(
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
    conditions: text("conditions", { mode: "json" })
      .$type<EventProperties>()
      .notNull()
      .default({}),
    definitionKey: text("definition_key"),
    icon: text("icon").notNull().default("target"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("goals_site_definition").on(
      table.siteId,
      sql`coalesce(${table.definitionKey}, ${table.eventName})`,
    ),
  ],
);

export const funnels = sqliteTable(
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
    windowHours: integer("window_hours").notNull(),
    steps: text("steps", { mode: "json" }).$type<FunnelStep[]>().notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("funnels_site").on(table.siteId)],
);

export const paymentIntegrations = sqliteTable("payment_integrations", {
  revision: text("revision").notNull().default("initial"),
  siteId: text("site_id")
    .primaryKey()
    .references(() => sites.id),
  apiKeyHash: text("api_key_hash"),
  apiKeyHint: text("api_key_hint"),
  stripeTestSecret: text("stripe_test_secret"),
  stripeLiveSecret: text("stripe_live_secret"),
  attributionModel: text("attribution_model", {
    enum: ["first_touch", "last_non_direct"],
  })
    .notNull()
    .default("first_touch"),
  attributionLookbackDays: integer("attribution_lookback_days")
    .notNull()
    .default(30),
  updatedAt: integer("updated_at").notNull(),
});

export const payments = sqliteTable(
  "payments",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    provider: text("provider", { enum: ["api", "stripe"] }).notNull(),
    mode: text("mode", { enum: ["test", "live"] }).notNull(),
    externalId: text("external_id").notNull(),
    amount: integer("amount").notNull(),
    refundedAmount: integer("refunded_amount").notNull().default(0),
    currency: text("currency").notNull(),
    paidAt: integer("paid_at").notNull(),
    visitorId: text("visitor_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
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

export const ingestionBuckets = sqliteTable(
  "ingestion_buckets",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    hour: integer("hour").notNull(),
    queued: integer("queued").notNull().default(0),
    stored: integer("stored").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    bots: integer("bots").notNull().default(0),
    enqueueFailures: integer("enqueue_failures").notNull().default(0),
    writeFailures: integer("write_failures").notNull().default(0),
    expired: integer("expired").notNull().default(0),
    lastQueuedAt: integer("last_queued_at"),
    lastStoredAt: integer("last_stored_at"),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.hour] }),
    index("ingestion_buckets_hour").on(table.hour),
  ],
);

export const rollupDays = sqliteTable(
  "rollup_days",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    day: integer("day").notNull(),
    completedAt: integer("completed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.day] })],
);

export const dailyTraffic = sqliteTable(
  "daily_traffic",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    day: integer("day").notNull(),
    dimension: text("dimension").notNull(),
    key: text("key").notNull(),
    pageviews: integer("pageviews").notNull(),
    identified: integer("identified").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.siteId, table.dimension, table.day, table.key],
    }),
  ],
);

export const rollupPending = sqliteTable(
  "rollup_pending",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    day: integer("day").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.day] }),
    index("rollup_pending_day").on(table.day),
  ],
);

export const dailyActivity = sqliteTable(
  "daily_activity",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    day: integer("day").notNull(),
    key: text("key").notNull(),
    visitorId: text("visitor_id"),
    sessionId: text("session_id"),
    name: text("name").notNull(),
    events: integer("events").notNull(),
    firstAt: integer("first_at").notNull(),
    lastAt: integer("last_at").notNull(),
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

export const visitorFirstSeen = sqliteTable(
  "visitor_first_seen",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    visitorId: text("visitor_id").notNull(),
    firstAt: integer("first_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.visitorId] })],
);

export const sessionSummaries = sqliteTable(
  "session_summaries",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    visitorId: text("visitor_id").notNull(),
    sessionId: text("session_id").notNull(),
    started: integer("started").notNull(),
    ended: integer("ended").notNull(),
    views: integer("views").notNull(),
    customEvents: integer("custom_events").notNull(),
    entryPath: text("entry_path"),
    exitPath: text("exit_path"),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.visitorId, table.sessionId] }),
  ],
);

// Ephemeral presence, separate from report events and rollups.
export const visitorPresence = sqliteTable(
  "visitor_presence",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    visitorId: text("visitor_id").notNull(),
    sessionId: text("session_id").notNull(),
    path: text("path").notNull(),
    receivedAt: integer("received_at").notNull(),
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
export const dailyVisitorDimensions = sqliteTable(
  "daily_visitor_dimensions",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    day: integer("day").notNull(),
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

export const apiCredentials = sqliteTable(
  "api_credentials",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    hint: text("hint").notNull(),
    scopes: text("scopes").notNull(),
    siteIds: text("site_ids").notNull(),
    allSites: integer("all_sites").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    kind: text("kind").notNull(),
    clientId: text("client_id"),
    audience: text("audience"),
    refreshHash: text("refresh_hash"),
    refreshExpiresAt: integer("refresh_expires_at"),
  },
  (t) => [
    uniqueIndex("api_credentials_token").on(t.tokenHash),
    index("api_credentials_owner").on(t.ownerId),
    uniqueIndex("api_credentials_refresh").on(t.refreshHash),
  ],
);

export const apiAudit = sqliteTable(
  "api_audit",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    actorId: text("actor_id").notNull(),
    siteId: text("site_id"),
    operation: text("operation").notNull(),
    resourceId: text("resource_id"),
    fields: text("fields").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("api_audit_owner_time").on(t.ownerId, t.createdAt, t.id)],
);

export const apiIdempotency = sqliteTable(
  "api_idempotency",
  {
    id: text("id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    response: text("response").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("api_idempotency_expiry").on(t.expiresAt)],
);

export const apiWriteGuards = sqliteTable(
  "api_write_guards",
  {
    id: text("id").primaryKey(),
    valid: integer("valid").notNull(),
  },
  (t) => [check("api_write_valid", sql`${t.valid} = 1`)],
);

export const oauthClients = sqliteTable("oauth_clients", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const oauthCodes = sqliteTable("oauth_codes", {
  hash: text("hash").primaryKey(),
  ownerId: text("owner_id").notNull(),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  challenge: text("challenge").notNull(),
  scopes: text("scopes").notNull(),
  siteIds: text("site_ids").notNull(),
  allSites: integer("all_sites").notNull(),
  resource: text("resource").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedBy: text("used_by"),
});

export const oauthRefreshUsed = sqliteTable("oauth_refresh_used", {
  hash: text("hash").primaryKey(),
  credentialId: text("credential_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const paymentAttributions = sqliteTable(
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
    utmCampaign: text("utm_campaign"),
    referrerHost: text("referrer_host"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    browser: text("browser"),
    os: text("os"),
    device: text("device"),
    lookbackDays: integer("lookback_days").notNull(),
    createdAt: integer("created_at").notNull(),
    checkedAt: integer("checked_at").notNull(),
    finalizeAfter: integer("finalize_after").notNull(),
    finalizedAt: integer("finalized_at"),
    receivedAt: integer("received_at"),
    trackingVersion: integer("tracking_version"),
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

export const sitePublicShares = sqliteTable("site_public_shares", {
  siteId: text("site_id")
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  publicId: text("public_id").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  events: integer("events", { mode: "boolean" }).notNull().default(false),
  visitors: integer("visitors", { mode: "boolean" }).notNull().default(false),
  revenue: integer("revenue", { mode: "boolean" }).notNull().default(false),
  conversions: integer("conversions", { mode: "boolean" })
    .notNull()
    .default(false),
});
