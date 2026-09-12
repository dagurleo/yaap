import { sql } from "drizzle-orm";
import { createDb } from "../../db";
import { isBillingPlanKey } from "../../lib/billing-plans";
import { eventProperties } from "../../lib/event-properties";
import type { AnalyticsEvent, BillingReceiptMessage, Env } from "../../types";
import { billingConfig } from "./config";
import { TRIAL_GRACE_MS } from "./trial";

export const BILLING_RECEIPT_REPLAY_MS = 30 * 24 * 60 * 60 * 1000;

type ReceiptState =
  "reserved" | "persisted" | "released" | "rejected" | "expired";

type ReceiptRow = {
  id: string;
  workspaceId: string;
  siteId: string;
  eventId: string;
  state: ReceiptState;
  payload: string;
  publishState: "pending" | "published" | "unknown" | "abandoned";
  publishAttempts: number;
  replayUntil: number;
};

type PeriodCandidate = {
  id: string;
  workspaceId: string;
  source: "trial" | "subscription";
  sourceId: string;
  startsAt: number;
  endsAt: number;
  allowance: number;
  admissionCeiling: number;
  persistedCount: number;
  reservedCount: number;
  accountEnvironment: string;
  trialStartsAt: number | null;
  trialEndsAt: number | null;
  subscriptionId: string | null;
  subscriptionEnvironment: string | null;
  polarProductId: string | null;
  planKey: string | null;
  providerStatus: string | null;
  currentPeriodStartsAt: number | null;
  currentPeriodEndsAt: number | null;
  paidThroughAt: number | null;
  paymentGraceEndsAt: number | null;
};

export type AdmissionResult =
  | { accepted: true; receiptId: string; duplicate: boolean }
  | {
      accepted: false;
      reason: "collection_paused" | "event_terminal";
      retryable: false;
    };

export function isBillingReceiptMessage(
  value: AnalyticsEvent | BillingReceiptMessage,
): value is BillingReceiptMessage {
  return "kind" in value && value.kind === "billing_receipt";
}

function receiptQuery(id: string) {
  return sql`select id,workspace_id as "workspaceId",site_id as "siteId",event_id as "eventId",state,payload,publish_state as "publishState",publish_attempts as "publishAttempts",replay_until as "replayUntil"
    from billing_event_receipts where id=${id} limit 1`;
}

async function existingReceipt(
  env: Env,
  workspaceId: string,
  siteId: string,
  eventId: string,
) {
  return (
    await createDb(env).all<ReceiptRow>(
      sql`select id,workspace_id as "workspaceId",site_id as "siteId",event_id as "eventId",state,payload,publish_state as "publishState",publish_attempts as "publishAttempts",replay_until as "replayUntil"
        from billing_event_receipts where workspace_id=${workspaceId} and site_id=${siteId} and event_id=${eventId} limit 1`,
    )
  )[0];
}

async function periodCandidates(env: Env, workspaceId: string, at: number) {
  return createDb(env).all<PeriodCandidate>(
    sql`select p.id,p.workspace_id as "workspaceId",p.source,p.source_id as "sourceId",p.starts_at as "startsAt",p.ends_at as "endsAt",p.allowance,p.admission_ceiling as "admissionCeiling",p.persisted_count as "persistedCount",p.reserved_count as "reservedCount",
      a.environment as "accountEnvironment",a.trial_starts_at as "trialStartsAt",a.trial_ends_at as "trialEndsAt",
      s.id as "subscriptionId",s.environment as "subscriptionEnvironment",s.polar_product_id as "polarProductId",s.plan_key as "planKey",s.provider_status as "providerStatus",s.current_period_starts_at as "currentPeriodStartsAt",s.current_period_ends_at as "currentPeriodEndsAt",s.paid_through_at as "paidThroughAt",s.payment_grace_ends_at as "paymentGraceEndsAt"
      from billing_usage_periods p
      join billing_accounts a on a.workspace_id=p.workspace_id
      left join billing_subscriptions s on s.id=p.source_id and s.workspace_id=p.workspace_id
      where p.workspace_id=${workspaceId} and p.starts_at<=${at} and p.ends_at>${at}
      order by case when p.source='subscription' then 0 else 1 end,p.starts_at desc`,
  );
}

function entitledPeriod(
  config: Extract<ReturnType<typeof billingConfig>, { mode: "hosted" }>,
  rows: PeriodCandidate[],
  workspaceId: string,
  at: number,
) {
  return rows.find((row) => {
    if (row.accountEnvironment !== config.environment) return false;
    if (row.source === "trial")
      return (
        row.sourceId === workspaceId &&
        row.trialStartsAt !== null &&
        row.trialEndsAt !== null &&
        at >= row.trialStartsAt &&
        at < row.trialEndsAt + TRIAL_GRACE_MS
      );
    if (
      row.subscriptionId !== row.sourceId ||
      row.subscriptionEnvironment !== config.environment ||
      !row.planKey ||
      !isBillingPlanKey(row.planKey) ||
      config.productIds[row.planKey] !== row.polarProductId ||
      row.currentPeriodStartsAt === null ||
      row.currentPeriodEndsAt === null ||
      at < row.currentPeriodStartsAt ||
      at >= row.currentPeriodEndsAt
    )
      return false;
    if (row.providerStatus === "active")
      return row.paidThroughAt !== null && at < row.paidThroughAt;
    return (
      row.providerStatus === "past_due" &&
      row.paymentGraceEndsAt !== null &&
      at < row.paymentGraceEndsAt
    );
  });
}

export async function canHostedWorkspaceCollect(
  env: Env,
  workspaceId: string,
  at = Date.now(),
) {
  const config = billingConfig(env);
  if (config.mode !== "hosted") return true;
  const period = entitledPeriod(
    config,
    await periodCandidates(env, workspaceId, at),
    workspaceId,
    at,
  );
  return Boolean(
    period &&
    period.persistedCount + period.reservedCount < period.admissionCeiling,
  );
}

function retryAt(attempts: number, now: number) {
  return now + Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.min(attempts, 7));
}

async function publishReceipt(env: Env, receipt: ReceiptRow) {
  const db = createDb(env);
  const now = Date.now();
  try {
    await env.EVENTS.send({ kind: "billing_receipt", receiptId: receipt.id });
    await db.run(
      sql`update billing_event_receipts set publish_state='published',publish_attempts=publish_attempts+1,last_publish_at=${now},updated_at=${now} where id=${receipt.id}`,
    );
    return true;
  } catch {
    await db.run(
      sql`update billing_event_receipts set publish_state='unknown',publish_attempts=publish_attempts+1,last_publish_at=${now},next_publish_at=${retryAt(receipt.publishAttempts + 1, now)},updated_at=${now} where id=${receipt.id} and state='reserved'`,
    );
    return false;
  }
}

export async function admitHostedEvent(
  env: Env,
  event: AnalyticsEvent,
  workspaceId: string,
  siteLabel: string,
): Promise<AdmissionResult> {
  const config = billingConfig(env);
  if (config.mode !== "hosted")
    throw new Error("Hosted event admission requires hosted mode");
  const duplicate = await existingReceipt(
    env,
    workspaceId,
    event.siteId,
    event.id,
  );
  if (duplicate) {
    if (
      duplicate.state === "reserved" &&
      duplicate.publishState !== "published"
    )
      await publishReceipt(env, duplicate);
    return duplicate.state === "reserved" || duplicate.state === "persisted"
      ? { accepted: true, receiptId: duplicate.id, duplicate: true }
      : { accepted: false, reason: "event_terminal", retryable: false };
  }

  const period = entitledPeriod(
    config,
    await periodCandidates(env, workspaceId, event.receivedAt),
    workspaceId,
    event.receivedAt,
  );
  if (!period)
    return { accepted: false, reason: "collection_paused", retryable: false };

  const db = createDb(env);
  const receiptId = crypto.randomUUID();
  try {
    await db.run(
      sql`insert into billing_event_receipts(id,workspace_id,site_id,site_label,event_id,period_id,ingressed_at,state,payload,publish_state,publish_attempts,next_publish_at,replay_until,updated_at)
        values(${receiptId},${workspaceId},${event.siteId},${siteLabel},${event.id},${period.id},${event.receivedAt},'reserved',${JSON.stringify(event)},'pending',0,${event.receivedAt},${event.receivedAt + BILLING_RECEIPT_REPLAY_MS},${event.receivedAt})`,
    );
  } catch (error) {
    const raced = await existingReceipt(
      env,
      workspaceId,
      event.siteId,
      event.id,
    );
    if (raced) {
      if (raced.state === "reserved" && raced.publishState !== "published")
        await publishReceipt(env, raced);
      return raced.state === "reserved" || raced.state === "persisted"
        ? { accepted: true, receiptId: raced.id, duplicate: true }
        : { accepted: false, reason: "event_terminal", retryable: false };
    }
    const refreshed = entitledPeriod(
      config,
      await periodCandidates(env, workspaceId, event.receivedAt),
      workspaceId,
      event.receivedAt,
    );
    if (
      refreshed &&
      refreshed.persistedCount + refreshed.reservedCount >=
        refreshed.admissionCeiling
    )
      return { accepted: false, reason: "collection_paused", retryable: false };
    throw error;
  }
  const receipt = (await db.all<ReceiptRow>(receiptQuery(receiptId)))[0];
  await publishReceipt(env, receipt);
  return { accepted: true, receiptId, duplicate: false };
}

async function finishReceipt(
  env: Env,
  receiptId: string,
  state: "released" | "rejected" | "expired",
  reason: string,
) {
  const now = Date.now();
  await createDb(env).run(
    sql`update billing_event_receipts set state=${state},publish_state='abandoned',terminal_reason=${reason},updated_at=${now}
      where id=${receiptId} and state='reserved'`,
  );
}

function parseReceiptEvent(receipt: ReceiptRow): AnalyticsEvent | null {
  try {
    const value = JSON.parse(receipt.payload) as AnalyticsEvent;
    if (
      !value ||
      (value.version !== 1 && value.version !== 2) ||
      value.id !== receipt.eventId ||
      value.siteId !== receipt.siteId ||
      typeof value.name !== "string" ||
      typeof value.path !== "string" ||
      typeof value.receivedAt !== "number"
    )
      return null;
    value.properties = eventProperties(value.properties);
    return value;
  } catch {
    return null;
  }
}

export async function consumeHostedReceipt(env: Env, receiptId: string) {
  const db = createDb(env);
  const receipt = (await db.all<ReceiptRow>(receiptQuery(receiptId)))[0];
  if (!receipt || receipt.state !== "reserved") return "terminal" as const;
  const now = Date.now();
  if (now > receipt.replayUntil) {
    await finishReceipt(env, receipt.id, "expired", "replay_window_expired");
    return "expired" as const;
  }
  const event = parseReceiptEvent(receipt);
  if (!event) {
    await finishReceipt(env, receipt.id, "rejected", "invalid_payload");
    return "rejected" as const;
  }
  const site = await db.findSite(receipt.siteId);
  if (!site || site.workspaceId !== receipt.workspaceId) {
    await finishReceipt(env, receipt.id, "rejected", "site_unavailable");
    return "rejected" as const;
  }
  if (
    site.eventRetentionDays &&
    event.receivedAt < now - site.eventRetentionDays * 86_400_000
  ) {
    await finishReceipt(env, receipt.id, "expired", "retention_expired");
    return "expired" as const;
  }
  let inserted: boolean;
  try {
    inserted = await db.insertEvent(event, receipt.id);
  } catch (error) {
    const latest = (await db.all<ReceiptRow>(receiptQuery(receipt.id)))[0];
    if (latest && latest.state !== "reserved") return "terminal" as const;
    throw error;
  }
  if (!inserted) {
    await finishReceipt(env, receipt.id, "released", "duplicate_event");
    return "duplicate" as const;
  }
  return "stored" as const;
}

export async function repairBillingOutbox(env: Env, limit = 100) {
  const config = billingConfig(env);
  if (config.mode === "self_hosted") return 0;
  const db = createDb(env);
  const now = Date.now();
  const batchLimit = Math.max(1, Math.min(limit, 100));
  const expired = await db.all<ReceiptRow>(
    sql`select id,workspace_id as "workspaceId",site_id as "siteId",event_id as "eventId",state,payload,publish_state as "publishState",publish_attempts as "publishAttempts",replay_until as "replayUntil"
      from billing_event_receipts where state='reserved' and replay_until<${now}
      order by replay_until,id limit ${batchLimit}`,
  );
  for (const receipt of expired)
    await finishReceipt(env, receipt.id, "expired", "replay_window_expired");
  await db.run(
    sql`delete from billing_event_receipts where id in (
      select id from billing_event_receipts where state!='reserved' and replay_until<${now}
      order by replay_until,id limit ${batchLimit}
    )`,
  );
  const receipts = await db.all<ReceiptRow>(
    sql`select id,workspace_id as "workspaceId",site_id as "siteId",event_id as "eventId",state,payload,publish_state as "publishState",publish_attempts as "publishAttempts",replay_until as "replayUntil"
      from billing_event_receipts where state='reserved' and publish_state in ('pending','unknown') and next_publish_at<=${now} and replay_until>=${now}
      order by next_publish_at,id limit ${batchLimit}`,
  );
  let published = 0;
  for (const receipt of receipts)
    if (await publishReceipt(env, receipt)) published++;
  return published;
}
