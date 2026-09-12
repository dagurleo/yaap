import { sql } from "drizzle-orm";
import {
  BILLING_PLANS,
  isBillingPlanKey,
  type BillingPlanKey,
} from "../../lib/billing-plans";
import { createDb } from "../../db";
import { HttpError } from "../../http";
import type { Env } from "../../types";
import { requireAccountOwner } from "../access";
import { billingConfig } from "./config";
import { resolveEntitlements, type LocalBillingState } from "./entitlements";
import { activateHostedTrialForVerifiedOwner } from "./trial";
import { TRIAL_GRACE_MS } from "./trial";

type BillingAccountRow = {
  trialStartsAt: number | null;
  trialEndsAt: number | null;
  recoveryEndsAt: number | null;
};
type BillingSubscriptionRow = {
  id: string;
  polarProductId: string;
  planKey: string;
  planVersion: number;
  providerStatus: string;
  currentPeriodStartsAt: number;
  currentPeriodEndsAt: number;
  paidThroughAt: number;
  paymentGraceEndsAt: number | null;
  cancelAtPeriodEnd: number | boolean;
  pendingPlanKey: string | null;
  pendingPlanEffectiveAt: number | null;
  lastReconciledAt: number;
};
type UsagePeriodRow = {
  id: string;
  source: "trial" | "subscription";
  sourceId: string;
  planKey: string | null;
  startsAt: number;
  endsAt: number;
  allowance: number;
  admissionCeiling: number;
  persisted: number;
  reserved: number;
};

const providerStatuses = new Set([
  "active",
  "past_due",
  "canceled",
  "revoked",
  "incomplete",
]);

export async function billingOverview(env: Env, actorUserId: string) {
  const config = billingConfig(env);
  const workspace = await envBillingWorkspace(env, actorUserId);
  if (config.mode === "self_hosted")
    return {
      mode: config.mode,
      workspaceId: workspace.id,
      catalogVersion: null,
      plans: [],
      entitlements: resolveEntitlements(config.mode, {}),
    };

  await activateHostedTrialForVerifiedOwner(env, actorUserId);

  const { db } = await requireAccountOwner(env, actorUserId, workspace.id);
  const now = Date.now();
  const [[account], [subscription], [usage], [pendingOperation]] =
    await db.batch([
      db.query<BillingAccountRow>(
        sql`select trial_starts_at as "trialStartsAt",trial_ends_at as "trialEndsAt",recovery_ends_at as "recoveryEndsAt"
          from billing_accounts where workspace_id=${workspace.id} and environment=${config.environment} limit 1`,
      ),
      db.query<BillingSubscriptionRow>(
        sql`select id,polar_product_id as "polarProductId",plan_key as "planKey",plan_version as "planVersion",provider_status as "providerStatus",current_period_starts_at as "currentPeriodStartsAt",current_period_ends_at as "currentPeriodEndsAt",paid_through_at as "paidThroughAt",payment_grace_ends_at as "paymentGraceEndsAt",cancel_at_period_end as "cancelAtPeriodEnd",pending_plan_key as "pendingPlanKey",pending_plan_effective_at as "pendingPlanEffectiveAt",last_reconciled_at as "lastReconciledAt"
          from billing_subscriptions where workspace_id=${workspace.id} and environment=${config.environment}
          order by case when provider_status not in ('canceled','revoked') then 0 else 1 end,current_period_ends_at desc,updated_at desc limit 1`,
      ),
      db.query<UsagePeriodRow>(
        sql`select id,source,source_id as "sourceId",plan_key as "planKey",starts_at as "startsAt",ends_at as "endsAt",allowance,admission_ceiling as "admissionCeiling",persisted_count as persisted,reserved_count as reserved
          from billing_usage_periods where workspace_id=${workspace.id} and starts_at<=${now} and ends_at>${now}
          order by case when source='subscription' then 0 else 1 end,starts_at desc limit 1`,
      ),
      db.query<{ id: string }>(
        sql`select id from billing_operations where workspace_id=${workspace.id} and state in ('pending','unknown') order by created_at desc limit 1`,
      ),
    ] as const);

  const subscriptionValid =
    !!subscription &&
    isBillingPlanKey(subscription.planKey) &&
    providerStatuses.has(subscription.providerStatus) &&
    config.productIds[subscription.planKey as BillingPlanKey] ===
      subscription.polarProductId;
  const usagePlanValid = !usage?.planKey || isBillingPlanKey(usage.planKey);
  const usageIdentityValid =
    !usage ||
    (usage.source === "trial"
      ? usage.sourceId === workspace.id
      : subscriptionValid && usage.sourceId === subscription.id);
  const local: LocalBillingState = {
    ...(account &&
    account.trialStartsAt !== null &&
    account.trialEndsAt !== null
      ? {
          trial: {
            startsAt: account.trialStartsAt,
            endsAt: account.trialEndsAt,
            graceEndsAt: account.trialEndsAt + TRIAL_GRACE_MS,
          },
        }
      : {}),
    recoveryEndsAt: account?.recoveryEndsAt,
    ...(subscriptionValid
      ? {
          subscription: {
            status: subscription.providerStatus as NonNullable<
              LocalBillingState["subscription"]
            >["status"],
            planKey: subscription.planKey as BillingPlanKey,
            currentPeriodStartsAt: subscription.currentPeriodStartsAt,
            currentPeriodEndsAt: subscription.currentPeriodEndsAt,
            paidThroughAt: subscription.paidThroughAt,
            paymentGraceEndsAt: subscription.paymentGraceEndsAt,
          },
        }
      : {}),
    ...(usage && usagePlanValid && usageIdentityValid
      ? {
          usage: {
            source: usage.source,
            planKey: usage.planKey as BillingPlanKey | null,
            startsAt: usage.startsAt,
            endsAt: usage.endsAt,
            allowance: usage.allowance,
            admissionCeiling: usage.admissionCeiling,
            persisted: usage.persisted,
            reserved: usage.reserved,
          },
        }
      : {}),
    checkoutPending: !!pendingOperation,
  };
  const siteUsage = usage
    ? await db.all<{
        siteId: string;
        siteLabel: string;
        persisted: number;
      }>(
        sql`select site_id as "siteId",site_label as "siteLabel",persisted_count as persisted
          from billing_usage_sites where period_id=${usage.id} order by persisted_count desc,site_id`,
      )
    : [];
  return {
    mode: config.mode,
    workspaceId: workspace.id,
    catalogVersion: BILLING_PLANS[0].version,
    plans: BILLING_PLANS,
    entitlements: resolveEntitlements(config.mode, local),
    subscription:
      subscriptionValid && subscription
        ? {
            planKey: subscription.planKey,
            planVersion: subscription.planVersion,
            status: subscription.providerStatus,
            currentPeriodStartsAt: subscription.currentPeriodStartsAt,
            currentPeriodEndsAt: subscription.currentPeriodEndsAt,
            cancelAtPeriodEnd: !!subscription.cancelAtPeriodEnd,
            pendingPlanKey: subscription.pendingPlanKey,
            pendingPlanEffectiveAt: subscription.pendingPlanEffectiveAt,
            lastReconciledAt: subscription.lastReconciledAt,
          }
        : null,
    siteUsage,
    syncState:
      (subscription && !subscriptionValid) ||
      (usage && (!usagePlanValid || !usageIdentityValid))
        ? "unresolved"
        : pendingOperation
          ? "pending"
          : "current",
  };
}

async function envBillingWorkspace(env: Env, actorUserId: string) {
  const owned = await createDb(env).workspaceForOwner(actorUserId);
  if (!owned) throw new HttpError(403, "An account owner is required");
  const { workspace } = await requireAccountOwner(env, actorUserId, owned.id);
  return workspace;
}
