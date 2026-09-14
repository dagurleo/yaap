import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb } from "../../db";
import { HttpError } from "../../http";
import {
  BILLING_PLANS,
  billingPlan,
  isBillingPlanKey,
  type BillingPlanKey,
} from "../../lib/billing-plans";
import type { Env } from "../../types";
import { requireAccountOwner } from "../access";
import { billingConfig, type BillingConfig } from "./config";
import {
  createBillingProvider,
  type BillingProvider,
  type ProviderCheckout,
  type ProviderSubscription,
} from "./polar";
import { activateHostedTrialForVerifiedOwner } from "./trial";

const OPEN_PROVIDER_STATUSES = new Set([
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
]);
const KNOWN_PROVIDER_STATUSES = new Set([
  ...OPEN_PROVIDER_STATUSES,
  "incomplete_expired",
  "canceled",
  "revoked",
]);

type HostedConfig = Extract<BillingConfig, { mode: "hosted" }>;
type OperationRow = {
  id: string;
  operationKey: string;
  kind: "checkout" | "upgrade" | "downgrade";
  requestFingerprint: string;
  expectedSubscriptionRevision: string | null;
  selectedPlanKey: string;
  selectedPlanVersion: number;
  state: "pending" | "unknown" | "complete" | "failed";
  providerCheckoutId: string | null;
};

type ActiveSubscriptionRow = {
  id: string;
  polarSubscriptionId: string;
  planKey: string;
  providerStatus: string;
  currentPeriodStartsAt: number;
  currentPeriodEndsAt: number;
  cancelAtPeriodEnd: number | boolean;
  pendingPlanKey: string | null;
  providerRevision: string;
  persisted: number;
  reserved: number;
};

function hosted(env: Env) {
  const config = billingConfig(env);
  if (config.mode !== "hosted")
    throw new HttpError(404, "Hosted billing is not enabled");
  return config;
}

function providerFor(config: HostedConfig, provider?: BillingProvider) {
  return provider ?? createBillingProvider(config);
}

function checkoutFingerprint(workspaceId: string, planKey: BillingPlanKey) {
  return createHash("sha256")
    .update(
      `${workspaceId}\ncheckout\n${planKey}\n${billingPlan(planKey).version}`,
    )
    .digest("hex");
}

function upgradeFingerprint(
  workspaceId: string,
  subscriptionId: string,
  revision: string,
  planKey: BillingPlanKey,
) {
  return createHash("sha256")
    .update(
      `${workspaceId}\nupgrade\n${subscriptionId}\n${revision}\n${planKey}\n${billingPlan(planKey).version}`,
    )
    .digest("hex");
}

function boundedError(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown provider error")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

function appUrl(origin: string, path: string) {
  const base = new URL(origin);
  const value = new URL(path, base);
  if (value.origin !== base.origin)
    throw new Error("Invalid billing return URL");
  return value.toString();
}

function planForProduct(config: HostedConfig, productId: string) {
  return BILLING_PLANS.find(
    (plan) => config.productIds[plan.key] === productId,
  );
}

function validateCheckout(
  checkout: ProviderCheckout,
  config: HostedConfig,
  workspaceId: string,
  planKey: BillingPlanKey,
) {
  const plan = billingPlan(planKey);
  if (
    checkout.externalCustomerId !== workspaceId ||
    checkout.productId !== config.productIds[planKey] ||
    checkout.amount !== plan.monthlyPriceCents ||
    checkout.currency.toUpperCase() !== plan.currency ||
    checkout.allowTrial !== false ||
    checkout.metadata.workspace_id !== workspaceId ||
    checkout.metadata.plan_key !== planKey
  )
    throw new Error(
      "Provider checkout does not match the requested account plan",
    );
  const url = new URL(checkout.url);
  if (url.protocol !== "https:")
    throw new Error("Provider checkout URL is invalid");
  return checkout;
}

async function ownerContext(env: Env, actorUserId: string) {
  await activateHostedTrialForVerifiedOwner(env, actorUserId);
  const db = createDb(env);
  const workspace = await db.workspaceForOwner(actorUserId);
  if (!workspace) throw new HttpError(403, "An account owner is required");
  await requireAccountOwner(env, actorUserId, workspace.id);
  const [owner] = await db.all<{
    name: string;
    email: string;
    emailVerified: number | boolean;
  }>(
    sql`select name,email,email_verified as "emailVerified" from "user" where id=${actorUserId} limit 1`,
  );
  if (!owner?.emailVerified)
    throw new HttpError(403, "Verify the account owner email first");
  return { db, workspace, owner };
}

async function operationByKey(
  env: Env,
  workspaceId: string,
  operationKey: string,
) {
  const [row] = await createDb(env).all<OperationRow>(
    sql`select id,operation_key as "operationKey",kind,request_fingerprint as "requestFingerprint",expected_subscription_revision as "expectedSubscriptionRevision",selected_plan_key as "selectedPlanKey",selected_plan_version as "selectedPlanVersion",state,provider_checkout_id as "providerCheckoutId"
      from billing_operations where workspace_id=${workspaceId} and operation_key=${operationKey} limit 1`,
  );
  return row;
}

async function openOperation(env: Env, workspaceId: string) {
  const [row] = await createDb(env).all<OperationRow>(
    sql`select id,operation_key as "operationKey",kind,request_fingerprint as "requestFingerprint",expected_subscription_revision as "expectedSubscriptionRevision",selected_plan_key as "selectedPlanKey",selected_plan_version as "selectedPlanVersion",state,provider_checkout_id as "providerCheckoutId"
      from billing_operations where workspace_id=${workspaceId} and kind='checkout' and state in ('pending','unknown') order by created_at limit 1`,
  );
  return row;
}

async function findCheckout(
  provider: BillingProvider,
  operation: OperationRow,
  workspaceId: string,
) {
  if (operation.providerCheckoutId)
    return provider.getCheckout(operation.providerCheckoutId);
  const open = await provider.listOpenCheckouts(workspaceId);
  if (open.length > 1)
    throw new Error("Multiple provider checkout sessions require review");
  return open[0] ?? null;
}

function checkoutResult(operationId: string, checkout: ProviderCheckout) {
  return {
    operationId,
    state: "pending" as const,
    checkoutUrl: checkout.url,
    expiresAt: checkout.expiresAt,
  };
}

async function fulfillCheckoutOperation(
  env: Env,
  config: HostedConfig,
  provider: BillingProvider,
  operation: OperationRow,
  workspaceId: string,
  owner: { name: string; email: string },
  origin: string,
  options: { updateExisting?: boolean; allowCreate?: boolean } = {},
) {
  const db = createDb(env);
  const planKey = operation.selectedPlanKey as BillingPlanKey;
  const now = Date.now();
  try {
    let checkout = await findCheckout(provider, operation, workspaceId);
    const metadata = {
      workspace_id: workspaceId,
      operation_id: operation.id,
      plan_key: planKey,
      catalog_version: operation.selectedPlanVersion,
    };
    if (checkout && checkout.status !== "open") {
      const open = await provider.listOpenCheckouts(workspaceId);
      if (open.length > 1)
        throw new Error("Multiple provider checkout sessions require review");
      checkout = open[0] ?? null;
    }
    if (checkout) {
      if (
        options.updateExisting ||
        checkout.productId !== config.productIds[planKey]
      )
        checkout = await provider.updateCheckout(checkout.id, {
          selectedProductId: config.productIds[planKey],
          metadata,
        });
    } else {
      if (!options.allowCreate)
        throw new HttpError(409, "Checkout creation is already in progress");
      const productIds = [
        config.productIds[planKey],
        ...BILLING_PLANS.filter((plan) => plan.key !== planKey).map(
          (plan) => config.productIds[plan.key],
        ),
      ];
      const successUrl = appUrl(
        origin,
        "/app/billing?billing=pending&checkout_id={CHECKOUT_ID}",
      ).replace("%7BCHECKOUT_ID%7D", "{CHECKOUT_ID}");
      checkout = await provider.createCheckout({
        externalCustomerId: workspaceId,
        customerEmail: owner.email,
        customerName: owner.name,
        productIds,
        selectedProductId: config.productIds[planKey],
        successUrl,
        returnUrl: appUrl(origin, "/app/billing?billing=cancelled"),
        metadata,
      });
    }
    validateCheckout(checkout, config, workspaceId, planKey);
    await db.run(
      sql`update billing_operations set provider_checkout_id=${checkout.id},provider_reference=${checkout.customerId},state='pending',bounded_error=null,updated_at=${now}
        where id=${operation.id} and workspace_id=${workspaceId} and state in ('pending','unknown')`,
    );
    return checkoutResult(operation.id, checkout);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    await db.run(
      sql`update billing_operations set state='unknown',bounded_error=${boundedError(error)},updated_at=${now}
        where id=${operation.id} and workspace_id=${workspaceId} and state in ('pending','unknown')`,
    );
    throw new HttpError(503, "Checkout is being reconciled; retry shortly");
  }
}

export async function createHostedCheckout(
  env: Env,
  actorUserId: string,
  origin: string,
  input: { planKey: unknown; operationKey: unknown },
  injectedProvider?: BillingProvider,
) {
  const config = hosted(env);
  if (!isBillingPlanKey(input.planKey))
    throw new HttpError(400, "Invalid planKey");
  if (
    typeof input.operationKey !== "string" ||
    !input.operationKey.trim() ||
    input.operationKey.length > 128
  )
    throw new HttpError(400, "Invalid operationKey");
  const planKey = input.planKey;
  const operationKey = input.operationKey.trim();
  const provider = providerFor(config, injectedProvider);
  const { db, workspace, owner } = await ownerContext(env, actorUserId);

  try {
    await reconcileWorkspace(env, workspace.id, provider);
  } catch {
    throw new HttpError(503, "Billing provider is temporarily unavailable");
  }
  const [active] = await db.all<{ id: string }>(
    sql`select id from billing_subscriptions where workspace_id=${workspace.id} and environment=${config.environment} and provider_status not in ('canceled','revoked') limit 1`,
  );
  if (active)
    throw new HttpError(409, "This account already has a subscription");

  const requestFingerprint = checkoutFingerprint(workspace.id, planKey);
  const keyed = await operationByKey(env, workspace.id, operationKey);
  if (keyed) {
    if (keyed.requestFingerprint !== requestFingerprint)
      throw new HttpError(
        409,
        "Operation key was already used for another request",
      );
    if (!["pending", "unknown"].includes(keyed.state))
      throw new HttpError(409, "Checkout operation is no longer open");
    return fulfillCheckoutOperation(
      env,
      config,
      provider,
      keyed,
      workspace.id,
      owner,
      origin,
    );
  }

  let current = await openOperation(env, workspace.id);
  if (current && current.selectedPlanKey === planKey)
    return fulfillCheckoutOperation(
      env,
      config,
      provider,
      current,
      workspace.id,
      owner,
      origin,
    );

  const id = crypto.randomUUID();
  const now = Date.now();
  const operation: OperationRow = {
    id,
    operationKey,
    kind: "checkout",
    requestFingerprint,
    expectedSubscriptionRevision: null,
    selectedPlanKey: planKey,
    selectedPlanVersion: billingPlan(planKey).version,
    state: "pending",
    providerCheckoutId: null,
  };
  try {
    if (current) {
      let existingCheckout: ProviderCheckout | null = null;
      try {
        existingCheckout = await findCheckout(provider, current, workspace.id);
      } catch {
        // The new intent is still durably recorded before any provider mutation.
      }
      operation.providerCheckoutId = existingCheckout?.id ?? null;
      await db.atomic([
        sql`update billing_operations set state='failed',bounded_error='Superseded by a newer checkout request',updated_at=${now}
          where id=${current.id} and state in ('pending','unknown')`,
        sql`insert into billing_operations(id,workspace_id,operation_key,kind,request_fingerprint,selected_plan_key,selected_plan_version,state,provider_checkout_id,created_at,updated_at)
          values(${id},${workspace.id},${operationKey},'checkout',${requestFingerprint},${planKey},${operation.selectedPlanVersion},'pending',${operation.providerCheckoutId},${now},${now})`,
      ]);
    } else {
      await db.run(
        sql`insert into billing_operations(id,workspace_id,operation_key,kind,request_fingerprint,selected_plan_key,selected_plan_version,state,created_at,updated_at)
          values(${id},${workspace.id},${operationKey},'checkout',${requestFingerprint},${planKey},${operation.selectedPlanVersion},'pending',${now},${now})`,
      );
    }
  } catch {
    current = await openOperation(env, workspace.id);
    if (!current) throw new HttpError(409, "Checkout state changed; retry");
    if (current.selectedPlanKey !== planKey)
      throw new HttpError(409, "Another checkout update is in progress");
    return fulfillCheckoutOperation(
      env,
      config,
      provider,
      current,
      workspace.id,
      owner,
      origin,
    );
  }
  return fulfillCheckoutOperation(
    env,
    config,
    provider,
    operation,
    workspace.id,
    owner,
    origin,
    {
      updateExisting: !!operation.providerCheckoutId,
      allowCreate: true,
    },
  );
}

async function activeSubscription(
  env: Env,
  workspaceId: string,
  environment: HostedConfig["environment"],
) {
  const [row] = await createDb(env).all<ActiveSubscriptionRow>(
    sql`select s.id,s.polar_subscription_id as "polarSubscriptionId",s.plan_key as "planKey",s.provider_status as "providerStatus",s.current_period_starts_at as "currentPeriodStartsAt",s.current_period_ends_at as "currentPeriodEndsAt",s.cancel_at_period_end as "cancelAtPeriodEnd",s.pending_plan_key as "pendingPlanKey",s.provider_revision as "providerRevision",coalesce(p.persisted_count,0) as persisted,coalesce(p.reserved_count,0) as reserved
      from billing_subscriptions s
      left join billing_usage_periods p on p.source='subscription' and p.source_id=s.id and p.starts_at=s.current_period_starts_at
      where s.workspace_id=${workspaceId} and s.environment=${environment} and s.provider_status not in ('canceled','revoked')
      order by s.current_period_ends_at desc limit 1`,
  );
  return row ?? null;
}

function validateUpgrade(
  row: ActiveSubscriptionRow | null,
  targetPlanKey: BillingPlanKey,
) {
  if (!row || !isBillingPlanKey(row.planKey))
    throw new HttpError(409, "No active subscription is available to upgrade");
  if (row.providerStatus !== "active")
    throw new HttpError(409, "Only an active subscription can be upgraded");
  if (row.cancelAtPeriodEnd)
    throw new HttpError(
      409,
      "Resume the subscription before changing its plan",
    );
  const current = billingPlan(row.planKey);
  const target = billingPlan(targetPlanKey);
  if (
    target.monthlyPriceCents <= current.monthlyPriceCents ||
    target.eventAllowance <= current.eventAllowance
  )
    throw new HttpError(400, "Choose a plan above the current plan");
  if (target.currency !== current.currency)
    throw new HttpError(409, "The selected plan uses another currency");
  return { current, target };
}

export async function previewHostedUpgrade(
  env: Env,
  actorUserId: string,
  targetPlanKey: unknown,
  injectedProvider?: BillingProvider,
  now = Date.now(),
) {
  const config = hosted(env);
  if (!isBillingPlanKey(targetPlanKey))
    throw new HttpError(400, "Invalid planKey");
  const provider = providerFor(config, injectedProvider);
  const { workspace } = await ownerContext(env, actorUserId);
  try {
    await reconcileWorkspace(env, workspace.id, provider);
  } catch {
    throw new HttpError(503, "Billing provider is temporarily unavailable");
  }
  const row = await activeSubscription(env, workspace.id, config.environment);
  const { current, target } = validateUpgrade(row, targetPlanKey);
  const periodLength = row.currentPeriodEndsAt - row.currentPeriodStartsAt;
  const remainingFraction =
    periodLength > 0
      ? Math.max(0, Math.min(1, (row.currentPeriodEndsAt - now) / periodLength))
      : 0;
  const admitted = row.persisted + row.reserved;
  return {
    currentPlan: current,
    targetPlan: target,
    persisted: row.persisted,
    reserved: row.reserved,
    remainingCapacity: Math.max(0, target.eventAllowance - admitted),
    estimatedChargeCents: Math.max(
      0,
      Math.round(
        (target.monthlyPriceCents - current.monthlyPriceCents) *
          remainingFraction,
      ),
    ),
    currency: target.currency,
    renewsAt: row.currentPeriodEndsAt,
    expectedRevision: row.providerRevision,
    clearsPendingChange: !!row.pendingPlanKey,
  };
}

function providerErrorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error))
    return null;
  return typeof error.statusCode === "number" ? error.statusCode : null;
}

function completedUpgrade(row: ActiveSubscriptionRow, operationId: string) {
  return {
    operationId,
    state: "complete" as const,
    planKey: row.planKey as BillingPlanKey,
  };
}

export async function executeHostedUpgrade(
  env: Env,
  actorUserId: string,
  input: {
    planKey: unknown;
    operationKey: unknown;
    expectedRevision: unknown;
  },
  injectedProvider?: BillingProvider,
) {
  const config = hosted(env);
  if (!isBillingPlanKey(input.planKey))
    throw new HttpError(400, "Invalid planKey");
  if (
    typeof input.operationKey !== "string" ||
    !input.operationKey.trim() ||
    input.operationKey.length > 128
  )
    throw new HttpError(400, "Invalid operationKey");
  if (
    typeof input.expectedRevision !== "string" ||
    !input.expectedRevision ||
    input.expectedRevision.length > 128
  )
    throw new HttpError(400, "Invalid subscription revision");

  const provider = providerFor(config, injectedProvider);
  const { db, workspace } = await ownerContext(env, actorUserId);
  try {
    await reconcileWorkspace(env, workspace.id, provider);
  } catch {
    throw new HttpError(503, "Billing provider is temporarily unavailable");
  }
  let row = await activeSubscription(env, workspace.id, config.environment);
  const operationKey = input.operationKey.trim();
  if (!row)
    throw new HttpError(409, "No active subscription is available to upgrade");
  const requestFingerprint = upgradeFingerprint(
    workspace.id,
    row.polarSubscriptionId,
    input.expectedRevision,
    input.planKey,
  );
  const keyed = await operationByKey(env, workspace.id, operationKey);
  if (keyed) {
    if (
      keyed.kind !== "upgrade" ||
      keyed.requestFingerprint !== requestFingerprint
    )
      throw new HttpError(
        409,
        "Operation key was already used for another request",
      );
    if (keyed.state === "failed")
      throw new HttpError(409, "This upgrade attempt is no longer active");
    if (row.planKey === input.planKey) return completedUpgrade(row, keyed.id);
    throw new HttpError(503, "Upgrade is being reconciled; retry shortly");
  }

  validateUpgrade(row, input.planKey);
  if (row.providerRevision !== input.expectedRevision)
    throw new HttpError(
      409,
      "Billing details changed; review the upgrade again",
    );

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.run(
      sql`insert into billing_operations(id,workspace_id,operation_key,kind,request_fingerprint,expected_subscription_revision,selected_plan_key,selected_plan_version,state,provider_reference,created_at,updated_at)
        values(${id},${workspace.id},${operationKey},'upgrade',${requestFingerprint},${row.providerRevision},${input.planKey},${billingPlan(input.planKey).version},'pending',${row.polarSubscriptionId},${now},${now})`,
    );
  } catch {
    throw new HttpError(409, "Another plan change is already in progress");
  }

  try {
    const updated = await provider.updateSubscription(row.polarSubscriptionId, {
      selectedProductId: config.productIds[input.planKey],
      prorationBehavior: "invoice",
    });
    if (
      updated.id !== row.polarSubscriptionId ||
      updated.externalCustomerId !== workspace.id ||
      updated.productId !== config.productIds[input.planKey] ||
      updated.status !== "active" ||
      updated.currentPeriodStartsAt !== row.currentPeriodStartsAt ||
      updated.currentPeriodEndsAt !== row.currentPeriodEndsAt
    )
      throw new Error("Provider subscription does not match the upgrade");
    await reconcileWorkspace(env, workspace.id, provider);
    row = await activeSubscription(env, workspace.id, config.environment);
    if (!row || row.planKey !== input.planKey)
      throw new Error("Provider upgrade has not reconciled yet");
    return completedUpgrade(row, id);
  } catch (error) {
    const status = providerErrorStatus(error);
    if (status && status >= 400 && status < 500) {
      await db.run(
        sql`update billing_operations set state='failed',bounded_error=${boundedError(error)},updated_at=${Date.now()} where id=${id} and state='pending'`,
      );
      if (status === 402)
        throw new HttpError(
          402,
          "The prorated payment failed; your current plan was not changed",
        );
      throw new HttpError(409, "Polar could not apply this plan change");
    }
    await db.run(
      sql`update billing_operations set state='unknown',bounded_error=${boundedError(error)},updated_at=${Date.now()} where id=${id} and state='pending'`,
    );
    throw new HttpError(503, "Upgrade is being reconciled; retry shortly");
  }
}

function localStatus(status: string) {
  if (status === "active") return "active";
  if (status === "past_due") return "past_due";
  if (status === "canceled") return "canceled";
  if (status === "revoked") return "revoked";
  return "incomplete";
}

function subscriptionRevision(subscription: ProviderSubscription) {
  return subscription.revision.padStart(24, "0");
}

export async function reconcileWorkspace(
  env: Env,
  workspaceId: string,
  injectedProvider?: BillingProvider,
) {
  const config = hosted(env);
  const provider = providerFor(config, injectedProvider);
  const db = createDb(env);
  const [workspace] = await db.all<{ id: string }>(
    sql`select id from workspaces where id=${workspaceId} limit 1`,
  );
  if (!workspace) return { state: "ignored" as const };

  const subscriptions = await provider.listSubscriptions(workspaceId);
  for (const subscription of subscriptions) {
    if (subscription.externalCustomerId !== workspaceId)
      throw new Error("Provider subscription belongs to another account");
    if (!planForProduct(config, subscription.productId))
      throw new Error("Provider subscription uses an unknown product");
    if (!KNOWN_PROVIDER_STATUSES.has(subscription.status))
      throw new Error("Provider subscription uses an unknown status");
    if (subscription.currentPeriodStartsAt >= subscription.currentPeriodEndsAt)
      throw new Error("Provider subscription has an invalid period");
  }
  const open = subscriptions.filter((subscription) =>
    OPEN_PROVIDER_STATUSES.has(subscription.status),
  );
  if (open.length > 1)
    throw new Error("Multiple provider subscriptions require review");

  const now = Date.now();
  const statements = subscriptions
    .slice()
    .sort(
      (a, b) =>
        Number(OPEN_PROVIDER_STATUSES.has(a.status)) -
        Number(OPEN_PROVIDER_STATUSES.has(b.status)),
    )
    .map((subscription) => {
      const plan = planForProduct(config, subscription.productId)!;
      const id = `polar:${config.environment}:${subscription.id}`;
      const revision = subscriptionRevision(subscription);
      return sql`insert into billing_subscriptions(id,workspace_id,environment,polar_subscription_id,polar_product_id,plan_key,plan_version,provider_status,started_at,current_period_starts_at,current_period_ends_at,paid_through_at,payment_grace_ends_at,cancel_at_period_end,pending_plan_key,pending_plan_version,pending_plan_effective_at,provider_revision,last_reconciled_at,created_at,updated_at)
        values(${id},${workspaceId},${config.environment},${subscription.id},${subscription.productId},${plan.key},${plan.version},${localStatus(subscription.status)},${subscription.currentPeriodStartsAt},${subscription.currentPeriodStartsAt},${subscription.currentPeriodEndsAt},${subscription.currentPeriodEndsAt},null,${subscription.cancelAtPeriodEnd ? 1 : 0},null,null,null,${revision},${now},${now},${now})
        on conflict(environment,polar_subscription_id) do update set polar_product_id=excluded.polar_product_id,plan_key=excluded.plan_key,plan_version=excluded.plan_version,provider_status=excluded.provider_status,current_period_starts_at=excluded.current_period_starts_at,current_period_ends_at=excluded.current_period_ends_at,paid_through_at=excluded.paid_through_at,cancel_at_period_end=excluded.cancel_at_period_end,provider_revision=excluded.provider_revision,last_reconciled_at=excluded.last_reconciled_at,updated_at=excluded.updated_at
        where billing_subscriptions.workspace_id=excluded.workspace_id and billing_subscriptions.provider_revision<=excluded.provider_revision`;
    });
  const selected = open[0] ?? subscriptions[0];
  if (selected) {
    const plan = planForProduct(config, selected.productId)!;
    const subscriptionId = `polar:${config.environment}:${selected.id}`;
    const revision = subscriptionRevision(selected);
    statements.push(
      sql`update billing_accounts set polar_customer_id=${selected.customerId},updated_at=${now}
        where workspace_id=${workspaceId} and environment=${config.environment}`,
    );
    if (selected.status === "active") {
      const periodId = `subscription:${config.environment}:${selected.id}:${selected.currentPeriodStartsAt}`;
      statements.push(
        sql`update billing_accounts set trial_ends_at=case when trial_starts_at is not null and trial_ends_at>${selected.currentPeriodStartsAt} then case when trial_starts_at<${selected.currentPeriodStartsAt} then ${selected.currentPeriodStartsAt} else trial_starts_at+1 end else trial_ends_at end,updated_at=${now}
          where workspace_id=${workspaceId} and environment=${config.environment}
          and exists(select 1 from billing_subscriptions where id=${subscriptionId} and provider_revision=${revision} and provider_status='active')`,
        sql`update billing_usage_periods set ends_at=case when starts_at<${selected.currentPeriodStartsAt} then ${selected.currentPeriodStartsAt} else starts_at+1 end,updated_at=${now}
          where workspace_id=${workspaceId} and source='trial' and ends_at>${selected.currentPeriodStartsAt}
          and exists(select 1 from billing_subscriptions where id=${subscriptionId} and provider_revision=${revision} and provider_status='active')`,
        sql`insert into billing_usage_periods(id,workspace_id,source,source_id,plan_key,plan_version,starts_at,ends_at,allowance,admission_ceiling,persisted_count,reserved_count,created_at,updated_at)
          select ${periodId},${workspaceId},'subscription',${subscriptionId},${plan.key},${plan.version},${selected.currentPeriodStartsAt},${selected.currentPeriodEndsAt},${plan.eventAllowance},${plan.admissionCeiling},0,0,${now},${now}
          where exists(select 1 from billing_subscriptions where id=${subscriptionId} and provider_revision=${revision} and provider_status='active')
          on conflict(id) do update set plan_key=excluded.plan_key,plan_version=excluded.plan_version,ends_at=excluded.ends_at,allowance=excluded.allowance,admission_ceiling=excluded.admission_ceiling,updated_at=excluded.updated_at`,
        sql`update billing_operations set state='complete',provider_reference=${selected.id},bounded_error=null,updated_at=${now}
          where workspace_id=${workspaceId} and selected_plan_key=${plan.key} and state in ('pending','unknown')`,
      );
    }
  }
  await db.atomic(statements);
  return selected
    ? { state: "current" as const, subscriptionId: selected.id }
    : { state: "empty" as const };
}

export async function reconcileHostedBilling(
  env: Env,
  actorUserId: string,
  injectedProvider?: BillingProvider,
) {
  const config = hosted(env);
  const { workspace } = await ownerContext(env, actorUserId);
  const result = await reconcileWorkspace(
    env,
    workspace.id,
    providerFor(config, injectedProvider),
  );
  return { workspaceId: workspace.id, ...result };
}

export async function createHostedPortalSession(
  env: Env,
  actorUserId: string,
  origin: string,
  injectedProvider?: BillingProvider,
) {
  const config = hosted(env);
  const provider = providerFor(config, injectedProvider);
  const { db, workspace } = await ownerContext(env, actorUserId);
  await reconcileWorkspace(env, workspace.id, provider);
  const [account] = await db.all<{ polarCustomerId: string | null }>(
    sql`select polar_customer_id as "polarCustomerId" from billing_accounts where workspace_id=${workspace.id} and environment=${config.environment} limit 1`,
  );
  if (!account?.polarCustomerId)
    throw new HttpError(409, "No billing customer exists for this account");
  const session = await provider.createPortalSession(
    workspace.id,
    appUrl(origin, "/app/billing?billing=return"),
  );
  const url = new URL(session.url);
  if (url.protocol !== "https:")
    throw new Error("Provider portal URL is invalid");
  return { portalUrl: session.url, expiresAt: session.expiresAt };
}

export async function repairBillingProviderState(
  env: Env,
  injectedProvider?: BillingProvider,
  limit = 10,
) {
  const config = billingConfig(env);
  if (config.mode !== "hosted") return 0;
  const provider = providerFor(config, injectedProvider);
  const db = createDb(env);
  const now = Date.now();
  const rows = await db.all<{
    id: string;
    workspaceId: string;
    kind: string;
    selectedPlanKey: string;
    updatedAt: number;
  }>(
    sql`select id,workspace_id as "workspaceId",kind,selected_plan_key as "selectedPlanKey",updated_at as "updatedAt" from billing_operations
      where state in ('pending','unknown') and updated_at<=${now - 30_000}
      order by updated_at,id limit ${limit}`,
  );
  for (const row of rows) {
    try {
      await reconcileWorkspace(env, row.workspaceId, provider);
      const [stillOpen] = await db.all<{ id: string }>(
        sql`select id from billing_operations where id=${row.id} and state in ('pending','unknown') limit 1`,
      );
      if (stillOpen && isBillingPlanKey(row.selectedPlanKey)) {
        if (row.kind !== "checkout") {
          if (row.updatedAt <= now - 5 * 60_000)
            await db.run(
              sql`update billing_operations set state='failed',bounded_error='Provider plan change was not confirmed',updated_at=${now}
                where id=${row.id} and state in ('pending','unknown')`,
            );
          continue;
        }
        const checkouts = await provider.listOpenCheckouts(row.workspaceId);
        if (checkouts.length > 1)
          throw new Error("Multiple provider checkout sessions require review");
        if (checkouts[0]) {
          validateCheckout(
            checkouts[0],
            config,
            row.workspaceId,
            row.selectedPlanKey,
          );
          await db.run(
            sql`update billing_operations set provider_checkout_id=${checkouts[0].id},state='pending',bounded_error=null,updated_at=${now}
              where id=${row.id} and state in ('pending','unknown')`,
          );
        } else if (row.updatedAt <= now - 5 * 60_000) {
          await db.run(
            sql`update billing_operations set state='failed',bounded_error='No provider checkout or subscription found during recovery',updated_at=${now}
              where id=${row.id} and state in ('pending','unknown')`,
          );
        }
      }
    } catch (error) {
      await db.run(
        sql`update billing_operations set state='unknown',bounded_error=${boundedError(error)},updated_at=${now}
          where workspace_id=${row.workspaceId} and state in ('pending','unknown')`,
      );
    }
  }
  return rows.length;
}
